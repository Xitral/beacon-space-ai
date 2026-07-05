const DATA_URL = "data/conjunction_events.json";

const TARGET_COLOR = Cesium.Color.fromCssColorString("#57a5ff");
const SECONDARY_COLOR = Cesium.Color.fromCssColorString("#ffb84d");
const SEPARATION_COLOR = Cesium.Color.fromCssColorString("#ff5b6e");
const CA_COLOR = Cesium.Color.fromCssColorString("#ffffff");

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
});

viewer.scene.globe.enableLighting = true;
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 2_000_000;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 90_000_000;

const state = {
  data: null,
  eventIndex: 0,
  horizonIndex: 0,
  playTimer: null,
  entities: [],
};

const eventSelect = document.getElementById("eventSelect");
const horizonSelect = document.getElementById("horizonSelect");
const metricsEl = document.getElementById("metrics");
const metadataEl = document.getElementById("metadata");
const playButton = document.getElementById("playButton");
const homeButton = document.getElementById("homeButton");

function kmToCartesian(point) {
  return new Cesium.Cartesian3(point[0] * 1000, point[1] * 1000, point[2] * 1000);
}

function pathToCartesian(points) {
  return points.map(kmToCartesian);
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

function riskColor(snapshot) {
  const risk = snapshot.current_risk_log10;
  if (risk !== null && risk !== undefined) {
    if (risk >= -5) return Cesium.Color.RED;
    if (risk >= -6) return Cesium.Color.ORANGE;
  }
  if (snapshot.model_probability !== null && snapshot.model_probability > 0.5) return Cesium.Color.ORANGE;
  return TARGET_COLOR;
}

function clearEntities() {
  state.entities.forEach((entity) => viewer.entities.remove(entity));
  state.entities = [];
}

function addEntity(options) {
  const entity = viewer.entities.add(options);
  state.entities.push(entity);
  return entity;
}

function currentEvent() {
  return state.data.events[state.eventIndex];
}

function currentSnapshot() {
  return currentEvent().snapshots[state.horizonIndex];
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
  metricsEl.innerHTML = `
    <div class="metric"><span class="label">Current risk</span><span class="value">${formatNumber(snapshot.current_risk_log10)}</span></div>
    <div class="metric"><span class="label">Risk probability</span><span class="value">${formatNumber(snapshot.current_risk_probability, 6)}</span></div>
    <div class="metric"><span class="label">Model score</span><span class="value">${formatPercent(snapshot.model_probability)}</span></div>
    <div class="metric"><span class="label">Uncertainty</span><span class="value">${formatPercent(snapshot.predictive_std)}</span></div>
    <div class="metric"><span class="label">Time to TCA</span><span class="value">${formatNumber(snapshot.time_to_tca_days, 2)} d</span></div>
    <div class="metric"><span class="label">High-risk label</span><span class="value">${event.high_risk ? "yes" : "no"}</span></div>
    <div class="metric"><span class="label">Relative distance</span><span class="value">${formatNumber(geometry.relative_distance_km, 3)} km</span></div>
    <div class="metric"><span class="label">Display scale</span><span class="value">${formatNumber(geometry.display_relative_scale, 1)}×</span></div>
    <div class="metric wide"><span class="label">Geometry source</span><span class="value">${geometry.mode.replaceAll("_", " ")}</span></div>
  `;

  const notes = [state.data.metadata.coordinate_note, state.data.metadata.display_scale_note].filter(Boolean).join(" ");
  metadataEl.innerHTML = `<h2>Notes</h2><p>${notes}</p>`;
}

function renderScene(fly = false) {
  clearEntities();

  const event = currentEvent();
  const snapshot = currentSnapshot();
  const geometry = snapshot.geometry;
  const target = kmToCartesian(geometry.target_position_km);
  const secondary = kmToCartesian(geometry.secondary_position_km);
  const closest = kmToCartesian(geometry.closest_approach_km);

  addEntity({
    name: "Target orbit",
    polyline: {
      positions: pathToCartesian(geometry.target_orbit_km),
      width: 2.5,
      material: TARGET_COLOR.withAlpha(0.82),
      clampToGround: false,
    },
  });

  addEntity({
    name: "Secondary orbit",
    polyline: {
      positions: pathToCartesian(geometry.secondary_orbit_km),
      width: 2.5,
      material: SECONDARY_COLOR.withAlpha(0.88),
      clampToGround: false,
    },
  });

  addEntity({
    name: "Displayed separation",
    polyline: {
      positions: [target, secondary],
      width: 3,
      material: SEPARATION_COLOR,
    },
  });

  addEntity({
    name: "Target object",
    position: target,
    point: { pixelSize: 11, color: riskColor(snapshot), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: {
      text: "Target",
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.45),
    },
  });

  addEntity({
    name: "Secondary object",
    position: secondary,
    point: { pixelSize: 10, color: SECONDARY_COLOR, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: {
      text: "Secondary",
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.45),
    },
  });

  addEntity({
    name: "Closest approach marker",
    position: closest,
    point: { pixelSize: 8, color: CA_COLOR, outlineColor: SEPARATION_COLOR, outlineWidth: 2 },
  });

  renderMetrics(event, snapshot);

  if (fly) focusEvent();
}

function focusEvent() {
  if (!state.entities.length) return;
  viewer.flyTo(state.entities, {
    duration: 0.8,
    offset: new Cesium.HeadingPitchRange(0.0, -0.55, 10_000_000),
  });
}

function setEvent(index) {
  state.eventIndex = Number(index);
  state.horizonIndex = 0;
  populateHorizonSelect();
  renderScene(true);
}

function setHorizon(index, fly = false) {
  state.horizonIndex = Number(index);
  horizonSelect.value = String(state.horizonIndex);
  renderScene(fly);
}

function togglePlay() {
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
    playButton.textContent = "Play horizons";
    return;
  }
  playButton.textContent = "Pause";
  state.playTimer = setInterval(() => {
    const event = currentEvent();
    const next = (state.horizonIndex + 1) % event.snapshots.length;
    setHorizon(next, false);
  }, 1300);
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
  state.data = data;
  if (!state.data.events || state.data.events.length === 0) {
    throw new Error("Viewer dataset contains no events.");
  }
  populateControls();
  renderScene(true);
});

eventSelect.addEventListener("change", (event) => setEvent(event.target.value));
horizonSelect.addEventListener("change", (event) => setHorizon(event.target.value, false));
playButton.addEventListener("click", togglePlay);
homeButton.addEventListener("click", focusEvent);
