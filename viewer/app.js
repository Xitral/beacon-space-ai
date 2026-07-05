const DATA_URL = "data/conjunction_events.json";

const EARTH_RADIUS_M = 6_371_000;
const INTERPOLATION_MS = 950;
const LABEL_FULL_SHOW_DISTANCE_M = 6_500_000;
const LABEL_HIDE_DISTANCE_M = 16_000_000;
const TARGET_COLOR = Cesium.Color.fromCssColorString("#57a5ff");
const SECONDARY_COLOR = Cesium.Color.fromCssColorString("#ffb84d");
const SEPARATION_COLOR = Cesium.Color.fromCssColorString("#ff5b6e");
const EARTH_COLOR = Cesium.Color.fromCssColorString("#163f7a");
const ATMOSPHERE_COLOR = Cesium.Color.fromCssColorString("#6eb6ff").withAlpha(0.10);

const SAMPLE_DATA = {
  metadata: {
    viewer: "BEACON CesiumJS conjunction triage viewer",
    horizon_order: ["early", "3d", "2d", "1d"],
    geometry_modes: ["sample_reference_orbit"],
    coordinate_note: "Sample data shown. Run python src/export_orbit_viewer.py to export real BEACON viewer data.",
    display_scale_note: "Small separations can be scaled for visibility.",
  },
  events: [
    {
      event_id: "sample",
      display_name: "Sample event",
      high_risk: 1,
      final_risk_log10: -4.8,
      snapshots: [
        makeSampleSnapshot("early", 4.6, -6.2, 0.18, 0.11, 0),
        makeSampleSnapshot("3d", 3.1, -5.7, 0.31, 0.09, 25),
        makeSampleSnapshot("2d", 2.0, -5.2, 0.52, 0.08, 50),
        makeSampleSnapshot("1d", 1.0, -4.8, 0.73, 0.06, 75),
      ],
    },
  ],
};

function makeSampleSnapshot(horizon, timeToTca, risk, modelProbability, predictiveStd, phaseShift) {
  const radius = 7071;
  const targetOrbit = [];
  const secondaryOrbit = [];

  for (let i = 0; i < 144; i += 1) {
    const theta = (i / 143) * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    const z = 900 * Math.sin(theta + 0.7);
    targetOrbit.push([x, y, z]);
    secondaryOrbit.push([x + 55 + phaseShift, y - 80, z + 120]);
  }

  const p = targetOrbit[30 + Math.floor(phaseShift / 5)];
  const q = secondaryOrbit[30 + Math.floor(phaseShift / 5)];

  return {
    horizon,
    time_to_tca_days: timeToTca,
    current_risk_log10: risk,
    current_risk_probability: Math.pow(10, risk),
    final_risk_log10: -4.8,
    model_probability: modelProbability,
    predictive_std: predictiveStd,
    geometry: {
      mode: "sample_reference_orbit",
      target_position_km: p,
      secondary_position_km: q,
      closest_approach_km: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
      target_orbit_km: targetOrbit,
      secondary_orbit_km: secondaryOrbit,
      relative_distance_km: 1.4,
      display_relative_scale: 120,
      display_relative_distance_km: 168,
    },
  };
}

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: false,
});

viewer.scene.globe.show = false;
viewer.scene.moon.show = false;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 450_000;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 90_000_000;
viewer.scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.WHEEL];

const state = {
  data: null,
  eventIndex: 0,
  horizonIndex: 0,
  playTimer: null,
  animationFrame: null,
  displaySnapshot: null,
  hovered: null,
  refs: {
    targetTrailSegments: [],
    secondaryTrailSegments: [],
  },
};

const eventSelect = document.getElementById("eventSelect");
const horizonSelect = document.getElementById("horizonSelect");
const metricsEl = document.getElementById("metrics");
const metadataEl = document.getElementById("metadata");
const playButton = document.getElementById("playButton");
const homeButton = document.getElementById("homeButton");
const trackToggle = document.getElementById("trackToggle");
const smoothToggle = document.getElementById("smoothToggle");

function kmToCartesian(point) {
  return new Cesium.Cartesian3(point[0] * 1000, point[1] * 1000, point[2] * 1000);
}

function cartesianMidpoint(a, b) {
  return Cesium.Cartesian3.lerp(a, b, 0.5, new Cesium.Cartesian3());
}

function pathToCartesianPair(a, b) {
  return [kmToCartesian(a), kmToCartesian(b)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  if (Math.abs(number) < 0.001 && number !== 0) return number.toExponential(2);
  return number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function metricValue(value, className = "") {
  return `<span class="value ${className}">${value}</span>`;
}

function currentEvent() {
  return state.data.events[state.eventIndex];
}

function currentSnapshot() {
  return currentEvent().snapshots[state.horizonIndex];
}

function objectName(snapshot, role) {
  const event = currentEvent();
  if (role === "target") {
    return snapshot.target_object_name || event.target_object_name || "Target";
  }
  if (role === "secondary") {
    return snapshot.secondary_object_name || event.secondary_object_name || "Secondary";
  }
  return "";
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) {
  if (a === null || a === undefined || b === null || b === undefined) return t < 1 ? a : b;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return t < 1 ? a : b;
  return x + (y - x) * t;
}

function lerpPoint(a, b, t) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return t < 1 ? a : b;
  return a.map((value, index) => lerp(value, b[index], t));
}

function distanceSquared(a, b) {
  return a.reduce((total, value, index) => total + (value - b[index]) ** 2, 0);
}

function isClosedPath(path) {
  return Array.isArray(path) && path.length > 2 && distanceSquared(path[0], path[path.length - 1]) < 1e-6;
}

function effectivePathLength(path) {
  if (!Array.isArray(path)) return 0;
  return isClosedPath(path) ? path.length - 1 : path.length;
}

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function samplePath(path, index) {
  const length = effectivePathLength(path);
  if (length <= 0) return null;
  if (length === 1) return path[0];

  const wrapped = wrapIndex(index, length);
  const i0 = Math.floor(wrapped);
  const i1 = (i0 + 1) % length;
  const t = wrapped - i0;
  return lerpPoint(path[i0], path[i1], t);
}

function closestPathIndex(path, point) {
  const length = effectivePathLength(path);
  if (length <= 0 || !Array.isArray(point)) return 0;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < length; i += 1) {
    const d = distanceSquared(path[i], point);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function shortestCircularDelta(start, end, length) {
  let delta = end - start;
  if (delta > length / 2) delta -= length;
  if (delta < -length / 2) delta += length;
  return delta;
}

function annotatePathProgress(snapshots, pathKey, positionKey, progressKey) {
  if (!snapshots.length) return;

  const firstPath = snapshots[0].geometry?.[pathKey];
  const length = effectivePathLength(firstPath);
  if (length < 2) return;

  const indices = snapshots.map((snapshot) => closestPathIndex(snapshot.geometry[pathKey], snapshot.geometry[positionKey]));
  const deltas = [];
  for (let i = 1; i < indices.length; i += 1) {
    deltas.push(shortestCircularDelta(indices[i - 1], indices[i], length));
  }

  const firstMotion = deltas.find((delta) => Math.abs(delta) > 0.001);
  const direction = firstMotion ? Math.sign(firstMotion) : 0;

  let progress = indices[0];
  snapshots[0].geometry[progressKey] = progress;

  for (let i = 1; i < snapshots.length; i += 1) {
    let delta = deltas[i - 1];
    if (direction !== 0 && delta * direction < 0) {
      delta += direction * length;
    }
    progress += delta;
    snapshots[i].geometry[progressKey] = progress;
  }
}

function prepareDataForPlayback(data) {
  data.events.forEach((event) => {
    annotatePathProgress(event.snapshots, "target_orbit_km", "target_position_km", "_target_path_progress");
    annotatePathProgress(event.snapshots, "secondary_orbit_km", "secondary_position_km", "_secondary_path_progress");
  });
  return data;
}

function lerpPath(a, b, t) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return t < 1 ? a : b;
  return a.map((point, index) => lerpPoint(point, b[index], t));
}

function interpolateAlongPath(pathA, pathB, fromPosition, toPosition, fromProgress, toProgress, t) {
  if (!Array.isArray(pathA) || !Array.isArray(pathB) || pathA.length !== pathB.length) {
    return lerpPoint(fromPosition, toPosition, t);
  }

  const length = effectivePathLength(pathA);
  if (length < 2) return lerpPoint(fromPosition, toPosition, t);

  const blendedPath = lerpPath(pathA, pathB, t);
  if (isFiniteNumber(fromProgress) && isFiniteNumber(toProgress)) {
    return samplePath(blendedPath, lerp(fromProgress, toProgress, t)) || lerpPoint(fromPosition, toPosition, t);
  }

  const startIndex = closestPathIndex(pathA, fromPosition);
  const endIndex = closestPathIndex(pathB, toPosition);
  const delta = shortestCircularDelta(startIndex, endIndex, length);
  return samplePath(blendedPath, startIndex + delta * t) || lerpPoint(fromPosition, toPosition, t);
}

function interpolatedSnapshot(from, to, t) {
  const geometryA = from.geometry;
  const geometryB = to.geometry;
  const targetProgress = lerp(geometryA._target_path_progress, geometryB._target_path_progress, t);
  const secondaryProgress = lerp(geometryA._secondary_path_progress, geometryB._secondary_path_progress, t);
  const targetPosition = interpolateAlongPath(
    geometryA.target_orbit_km,
    geometryB.target_orbit_km,
    geometryA.target_position_km,
    geometryB.target_position_km,
    geometryA._target_path_progress,
    geometryB._target_path_progress,
    t,
  );
  const secondaryPosition = interpolateAlongPath(
    geometryA.secondary_orbit_km,
    geometryB.secondary_orbit_km,
    geometryA.secondary_position_km,
    geometryB.secondary_position_km,
    geometryA._secondary_path_progress,
    geometryB._secondary_path_progress,
    t,
  );
  const closest = lerpPoint(targetPosition, secondaryPosition, 0.5);

  return {
    ...to,
    time_to_tca_days: lerp(from.time_to_tca_days, to.time_to_tca_days, t),
    current_risk_log10: lerp(from.current_risk_log10, to.current_risk_log10, t),
    current_risk_probability: lerp(from.current_risk_probability, to.current_risk_probability, t),
    final_risk_log10: lerp(from.final_risk_log10, to.final_risk_log10, t),
    model_probability: lerp(from.model_probability, to.model_probability, t),
    predictive_std: lerp(from.predictive_std, to.predictive_std, t),
    geometry: {
      ...geometryB,
      target_position_km: targetPosition,
      secondary_position_km: secondaryPosition,
      closest_approach_km: closest,
      _target_path_progress: targetProgress,
      _secondary_path_progress: secondaryProgress,
      target_orbit_km: lerpPath(geometryA.target_orbit_km, geometryB.target_orbit_km, t),
      secondary_orbit_km: lerpPath(geometryA.secondary_orbit_km, geometryB.secondary_orbit_km, t),
      relative_distance_km: lerp(geometryA.relative_distance_km, geometryB.relative_distance_km, t),
      display_relative_scale: lerp(geometryA.display_relative_scale, geometryB.display_relative_scale, t),
      display_relative_distance_km: lerp(geometryA.display_relative_distance_km, geometryB.display_relative_distance_km, t),
    },
  };
}

function stopAnimation() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function trailAlphaAtMidpoint(midpoint, progress, length) {
  const behindDistance = wrapIndex(progress - midpoint, length);
  const raw = 1 - behindDistance / length;
  const eased = Math.pow(clamp(raw, 0, 1), 1.6);
  return eased < 0.015 ? 0 : clamp(eased, 0, 0.94);
}

function buildDisplayedTrailSegments(path, progress, currentPosition) {
  const length = effectivePathLength(path);
  if (length < 2) return [];

  const wrappedProgress = wrapIndex(progress, length);
  const activeIndex = Math.floor(wrappedProgress);
  const frac = wrappedProgress - activeIndex;
  const livePoint = currentPosition || samplePath(path, wrappedProgress);
  const segments = [];

  for (let i = 0; i < length; i += 1) {
    const p0 = path[i];
    const p1 = path[(i + 1) % length];

    if (i === activeIndex) {
      if (frac > 1e-6) {
        segments.push({
          start: p0,
          end: livePoint,
          alpha: trailAlphaAtMidpoint(i + frac * 0.5, wrappedProgress, length),
        });
      }

      if (frac < 1 - 1e-6) {
        segments.push({
          start: livePoint,
          end: p1,
          alpha: trailAlphaAtMidpoint(i + frac + (1 - frac) * 0.5, wrappedProgress, length),
        });
      }
    } else {
      segments.push({
        start: p0,
        end: p1,
        alpha: trailAlphaAtMidpoint(i + 0.5, wrappedProgress, length),
      });
    }
  }

  return segments;
}

function ensureTrailSegments(refKey, count, color) {
  const segments = state.refs[refKey];
  while (segments.length < count) {
    const entity = viewer.entities.add({
      name: `${refKey} segment`,
      polyline: {
        positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.ZERO],
        width: 2.7,
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0)),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
      },
    });
    segments.push(entity);
  }

  while (segments.length > count) {
    const entity = segments.pop();
    viewer.entities.remove(entity);
  }

  return segments;
}

function updateTrailSegments(path, progress, currentPosition, refKey, color) {
  const length = effectivePathLength(path);
  if (length < 2) return;

  const safeProgress = isFiniteNumber(progress)
    ? Number(progress)
    : closestPathIndex(path, currentPosition || path[0]);

  const displaySegments = buildDisplayedTrailSegments(path, safeProgress, currentPosition);
  const segments = ensureTrailSegments(refKey, displaySegments.length, color);

  for (let i = 0; i < displaySegments.length; i += 1) {
    const segment = displaySegments[i];
    segments[i].polyline.positions = new Cesium.ConstantProperty(
      pathToCartesianPair(segment.start, segment.end),
    );
    segments[i].polyline.material = new Cesium.ColorMaterialProperty(
      color.withAlpha(segment.alpha),
    );
    segments[i].show = segment.alpha > 0;
  }
}

function labelAlphaForCamera() {
  if (!state.displaySnapshot) return 1;
  const center = eventCenter(state.displaySnapshot);
  const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, center);
  const alpha = (LABEL_HIDE_DISTANCE_M - distance) / (LABEL_HIDE_DISTANCE_M - LABEL_FULL_SHOW_DISTANCE_M);
  return clamp(alpha, 0, 1);
}

function applyLabelFade() {
  if (!state.refs.targetObject || !state.displaySnapshot) return;
  const alpha = labelAlphaForCamera();
  const show = alpha > 0.03;
  const textColor = Cesium.Color.WHITE.withAlpha(alpha);
  const backgroundColor = Cesium.Color.BLACK.withAlpha(0.45 * alpha);
  const centerBackgroundColor = Cesium.Color.BLACK.withAlpha(0.55 * alpha);

  state.refs.targetObject.label.show = show;
  state.refs.targetObject.label.fillColor = textColor;
  state.refs.targetObject.label.backgroundColor = backgroundColor;

  state.refs.secondaryObject.label.show = show;
  state.refs.secondaryObject.label.fillColor = textColor;
  state.refs.secondaryObject.label.backgroundColor = backgroundColor;

  state.refs.closestApproach.label.show = state.hovered === "center" && show;
  state.refs.closestApproach.label.fillColor = textColor;
  state.refs.closestApproach.label.backgroundColor = centerBackgroundColor;
  viewer.scene.requestRender();
}

function ensureSceneEntities() {
  if (state.refs.earth) return;

  state.refs.earth = viewer.entities.add({
    name: "Earth reference sphere",
    position: Cesium.Cartesian3.ZERO,
    ellipsoid: {
      radii: new Cesium.Cartesian3(EARTH_RADIUS_M, EARTH_RADIUS_M, EARTH_RADIUS_M),
      material: EARTH_COLOR,
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#6eb6ff").withAlpha(0.35),
    },
  });

  state.refs.atmosphere = viewer.entities.add({
    name: "Atmosphere reference shell",
    position: Cesium.Cartesian3.ZERO,
    ellipsoid: {
      radii: new Cesium.Cartesian3(EARTH_RADIUS_M * 1.025, EARTH_RADIUS_M * 1.025, EARTH_RADIUS_M * 1.025),
      material: ATMOSPHERE_COLOR,
    },
  });

  state.refs.separation = viewer.entities.add({
    name: "Displayed separation",
    polyline: {
      positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.ZERO],
      width: 3,
      material: SEPARATION_COLOR,
      arcType: Cesium.ArcType.NONE,
    },
  });

  state.refs.targetObject = viewer.entities.add({
    name: "Target object",
    position: Cesium.Cartesian3.ZERO,
    point: {
      pixelSize: 11,
      color: TARGET_COLOR,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "Target",
      show: true,
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.45),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  state.refs.secondaryObject = viewer.entities.add({
    name: "Secondary object",
    position: Cesium.Cartesian3.ZERO,
    point: {
      pixelSize: 10,
      color: SECONDARY_COLOR,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "Secondary",
      show: true,
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.45),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  state.refs.closestApproach = viewer.entities.add({
    name: "Conjunction midpoint",
    position: Cesium.Cartesian3.ZERO,
    point: {
      pixelSize: 8,
      color: SEPARATION_COLOR,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "",
      show: false,
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.55),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function populateControls() {
  eventSelect.innerHTML = "";

  state.data.events.forEach((event, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${event.display_name || `Event ${event.event_id}`} ${event.high_risk ? "• high risk" : ""}`;
    eventSelect.appendChild(option);
  });

  eventSelect.value = String(state.eventIndex);
  populateHorizonSelect();
}

function populateHorizonSelect() {
  const event = currentEvent();
  horizonSelect.innerHTML = "";

  event.snapshots.forEach((snapshot, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = snapshot.horizon;
    horizonSelect.appendChild(option);
  });

  state.horizonIndex = Math.min(state.horizonIndex, event.snapshots.length - 1);
  horizonSelect.value = String(state.horizonIndex);
}

function renderMetrics(event, snapshot) {
  const geometry = snapshot.geometry;
  const modelAvailable = isFiniteNumber(snapshot.model_probability);
  const uncertaintyAvailable = isFiniteNumber(snapshot.predictive_std);

  metricsEl.innerHTML = `
    <div class="metric"><span class="label">Current probability</span>${metricValue(formatNumber(snapshot.current_risk_probability, 6))}</div>
    <div class="metric"><span class="label">Risk log10</span>${metricValue(formatNumber(snapshot.current_risk_log10))}</div>
    <div class="metric"><span class="label">BEACON score</span>${modelAvailable ? metricValue(formatPercent(snapshot.model_probability)) : metricValue("not exported", "muted-value")}</div>
    <div class="metric"><span class="label">Uncertainty</span>${uncertaintyAvailable ? metricValue(formatPercent(snapshot.predictive_std)) : metricValue("not exported", "muted-value")}</div>
    <div class="metric"><span class="label">Time to TCA</span>${metricValue(`${formatNumber(snapshot.time_to_tca_days, 2)} d`)}</div>
    <div class="metric"><span class="label">Relative distance</span>${metricValue(`${formatNumber(geometry.relative_distance_km, 3)} km`)}</div>
    <div class="metric"><span class="label">Display scale</span>${metricValue(`${formatNumber(geometry.display_relative_scale, 1)}×`)}</div>
    <div class="metric wide"><span class="label">Geometry source</span>${metricValue(geometry.mode.replaceAll("_", " "))}</div>
  `;

  const notes = [state.data.metadata.coordinate_note, state.data.metadata.display_scale_note].filter(Boolean).join(" ");
  metadataEl.innerHTML = `<h2>Notes</h2><p>${notes}</p>`;
}

function updateEntityGeometry(snapshot) {
  ensureSceneEntities();

  const geometry = snapshot.geometry;
  const target = kmToCartesian(geometry.target_position_km);
  const secondary = kmToCartesian(geometry.secondary_position_km);
  const closest = cartesianMidpoint(target, secondary);

  viewer.entities.suspendEvents();

  updateTrailSegments(
    geometry.target_orbit_km,
    geometry._target_path_progress ?? closestPathIndex(geometry.target_orbit_km, geometry.target_position_km),
    geometry.target_position_km,
    "targetTrailSegments",
    TARGET_COLOR,
  );
  updateTrailSegments(
    geometry.secondary_orbit_km,
    geometry._secondary_path_progress ?? closestPathIndex(geometry.secondary_orbit_km, geometry.secondary_position_km),
    geometry.secondary_position_km,
    "secondaryTrailSegments",
    SECONDARY_COLOR,
  );

  state.refs.separation.polyline.positions = new Cesium.ConstantProperty([target, secondary]);
  state.refs.separation.polyline.material = new Cesium.ColorMaterialProperty(SEPARATION_COLOR);

  state.refs.targetObject.position = new Cesium.ConstantPositionProperty(target);
  state.refs.targetObject.point.color = new Cesium.ConstantProperty(TARGET_COLOR);

  state.refs.secondaryObject.position = new Cesium.ConstantPositionProperty(secondary);
  state.refs.secondaryObject.point.color = new Cesium.ConstantProperty(SECONDARY_COLOR);

  state.refs.closestApproach.position = new Cesium.ConstantPositionProperty(closest);
  state.refs.closestApproach.point.color = new Cesium.ConstantProperty(SEPARATION_COLOR);

  viewer.entities.resumeEvents();
  applyLabelFade();
  viewer.scene.requestRender();
}

function eventCenter(snapshot) {
  const geometry = snapshot.geometry;
  return cartesianMidpoint(kmToCartesian(geometry.target_position_km), kmToCartesian(geometry.secondary_position_km));
}

function cameraRangeForSnapshot(snapshot) {
  const geometry = snapshot.geometry;
  const center = eventCenter(snapshot);
  const target = kmToCartesian(geometry.target_position_km);
  const secondary = kmToCartesian(geometry.secondary_position_km);
  const separation = Cesium.Cartesian3.distance(target, secondary);
  const orbitalRadius = Cesium.Cartesian3.magnitude(center);
  return Math.max(2_800_000, Math.min(18_000_000, orbitalRadius * 0.30 + separation * 5));
}

function centerCameraOnSnapshot(snapshot) {
  const center = eventCenter(snapshot);
  const range = cameraRangeForSnapshot(snapshot);
  const offset = new Cesium.HeadingPitchRange(0.0, -0.42, range);
  viewer.trackedEntity = undefined;
  viewer.camera.lookAt(center, offset);
  applyLabelFade();
}

function setTracking(enabled) {
  if (enabled) {
    centerCameraOnSnapshot(state.displaySnapshot || currentSnapshot());
  } else {
    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    applyLabelFade();
  }
}

function renderSnapshot(snapshot, track = false) {
  state.displaySnapshot = snapshot;
  updateEntityGeometry(snapshot);
  renderMetrics(currentEvent(), snapshot);
  updateHoverLabels();

  if (track && trackToggle.checked) {
    centerCameraOnSnapshot(snapshot);
  } else {
    applyLabelFade();
  }
}

function renderScene(focus = false) {
  stopAnimation();
  const snapshot = currentSnapshot();
  renderSnapshot(snapshot, false);

  if (focus || trackToggle.checked) {
    centerCameraOnSnapshot(snapshot);
  }
}

function focusEvent() {
  trackToggle.checked = true;
  centerCameraOnSnapshot(state.displaySnapshot || currentSnapshot());
}

function transitionToHorizon(index, options = {}) {
  const targetIndex = Number(index);
  const event = currentEvent();
  const from = state.displaySnapshot || currentSnapshot();
  const to = event.snapshots[targetIndex];
  const smooth = smoothToggle.checked && options.smooth !== false;

  stopAnimation();
  state.horizonIndex = targetIndex;
  horizonSelect.value = String(targetIndex);

  if (!smooth) {
    renderSnapshot(to, true);
    return;
  }

  const startTime = performance.now();

  function frame(now) {
    const raw = Math.min(1, (now - startTime) / INTERPOLATION_MS);
    const eased = easeInOut(raw);
    const snapshot = interpolatedSnapshot(from, to, eased);
    renderSnapshot(snapshot, true);

    if (raw < 1) {
      state.animationFrame = requestAnimationFrame(frame);
    } else {
      state.animationFrame = null;
      renderSnapshot(to, true);
    }
  }

  state.animationFrame = requestAnimationFrame(frame);
}

function setEvent(index) {
  stopAnimation();
  state.eventIndex = Number(index);
  state.horizonIndex = 0;
  state.displaySnapshot = currentSnapshot();
  populateHorizonSelect();
  state.hovered = null;
  updateHoverLabels();
  renderScene(true);
}

function setHorizon(index) {
  transitionToHorizon(index, { smooth: smoothToggle.checked });
}

function togglePlay() {
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
    playButton.textContent = "Play horizons";
    return;
  }

  trackToggle.checked = true;
  playButton.textContent = "Pause";

  state.playTimer = setInterval(() => {
    const event = currentEvent();
    const next = (state.horizonIndex + 1) % event.snapshots.length;
    transitionToHorizon(next, { smooth: smoothToggle.checked });
  }, smoothToggle.checked ? 1250 : 900);
}

function updateHoverLabels() {
  if (!state.refs.targetObject || !state.displaySnapshot) return;
  const snapshot = state.displaySnapshot;

  state.refs.targetObject.label.text = state.hovered === "target" ? objectName(snapshot, "target") : "Target";
  state.refs.secondaryObject.label.text = state.hovered === "secondary" ? objectName(snapshot, "secondary") : "Secondary";
  state.refs.closestApproach.label.text = state.hovered === "center"
    ? `Distance: ${formatNumber(snapshot.geometry.relative_distance_km, 3)} km`
    : "";
  applyLabelFade();
}

function handleHover(movement) {
  const picked = viewer.scene.pick(movement.endPosition);
  let hovered = null;

  if (Cesium.defined(picked) && picked.id) {
    if (picked.id === state.refs.targetObject) hovered = "target";
    if (picked.id === state.refs.secondaryObject) hovered = "secondary";
    if (picked.id === state.refs.closestApproach) hovered = "center";
  }

  if (state.hovered !== hovered) {
    state.hovered = hovered;
    updateHoverLabels();
  }
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("Using sample data because exported viewer data was not found.", error);
    return SAMPLE_DATA;
  }
}

loadData().then((data) => {
  state.data = prepareDataForPlayback(data);
  if (!state.data.events || state.data.events.length === 0) {
    throw new Error("Viewer dataset contains no events.");
  }

  ensureSceneEntities();
  populateControls();
  state.displaySnapshot = currentSnapshot();
  renderScene(true);
});

eventSelect.addEventListener("change", (event) => setEvent(event.target.value));
horizonSelect.addEventListener("change", (event) => setHorizon(event.target.value));
playButton.addEventListener("click", togglePlay);
homeButton.addEventListener("click", focusEvent);
trackToggle.addEventListener("change", () => setTracking(trackToggle.checked));
smoothToggle.addEventListener("change", () => stopAnimation());
viewer.camera.changed.addEventListener(applyLabelFade);

const hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
hoverHandler.setInputAction(handleHover, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
