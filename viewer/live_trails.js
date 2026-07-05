// BEACON viewer UX/live-trail patch.
//
// This file patches app.js without changing its data model. It replaces the old
// static-looking orbit trail segments with a dynamic CallbackProperty trail that
// is recomputed from state.displaySnapshot on every browser frame. That means the
// trail uses the same interpolated positions as the dots and cannot wait until the
// horizon transition finishes before moving.

(function patchBeaconViewerUx() {
  const TRAIL_FRACTION_OF_ORBIT = 0.30;
  const TRAIL_POINT_COUNT = 64;
  const MIN_TRAIL_POINTS = 10;
  const LABEL_FADE_EASE = 0.18;

  const labelFadeState = {
    target: 1,
    current: 1,
  };

  function squaredDistance(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }

  function closestProgressOnPath(path, point, fallbackProgress) {
    const length = effectivePathLength(path);
    if (length < 2 || !Array.isArray(point)) {
      return isFiniteNumber(fallbackProgress) ? Number(fallbackProgress) : 0;
    }

    let bestProgress = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < length; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % length];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ap = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
      const denom = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const t = denom > 0 ? clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denom, 0, 1) : 0;
      const projected = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      const d = squaredDistance(projected, point);

      if (d < bestDistance) {
        bestDistance = d;
        bestProgress = i + t;
      }
    }

    return bestProgress;
  }

  function buildMovingTrailPositions(path, progress, currentPosition) {
    const length = effectivePathLength(path);
    if (length < 2) return [];

    const liveProgress = closestProgressOnPath(path, currentPosition, progress);
    const livePoint = currentPosition || samplePath(path, liveProgress);
    if (!Array.isArray(livePoint)) return [];

    const trailLength = Math.max(2, length * TRAIL_FRACTION_OF_ORBIT);
    const pointCount = Math.min(TRAIL_POINT_COUNT, Math.max(MIN_TRAIL_POINTS, Math.round(trailLength)));
    const startProgress = liveProgress - trailLength;
    const positions = [];

    for (let i = 0; i < pointCount; i += 1) {
      const t = i / (pointCount - 1);
      const sampleProgress = startProgress + trailLength * t;
      const point = i === pointCount - 1 ? livePoint : samplePath(path, sampleProgress);
      if (Array.isArray(point)) positions.push(kmToCartesian(point));
    }

    // Hard guarantee: the rendered trail head is the exact same point as the dot.
    positions[positions.length - 1] = kmToCartesian(livePoint);
    return positions;
  }

  function removeSegmentEntities(refKey) {
    const existing = state.refs[refKey] || [];
    for (const entity of existing) {
      viewer.entities.remove(entity);
    }
    state.refs[refKey] = [];
  }

  function ensureLiveTrailEntity(refKey, color) {
    const entityKey = `${refKey}LiveEntity`;
    const positionsKey = `${refKey}LivePositions`;

    if (state.refs[entityKey]) return state.refs[entityKey];

    removeSegmentEntities(refKey);
    state.refs[positionsKey] = [];

    const entity = viewer.entities.add({
      name: `${refKey} live animated trail`,
      polyline: {
        positions: new Cesium.CallbackProperty(() => state.refs[positionsKey] || [], false),
        width: 3.2,
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0.82)),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
      },
    });

    state.refs[entityKey] = entity;
    return entity;
  }

  function syncLiveTrail(path, progress, currentPosition, refKey, color) {
    const entity = ensureLiveTrailEntity(refKey, color);
    const positionsKey = `${refKey}LivePositions`;
    const positions = buildMovingTrailPositions(path, progress, currentPosition);
    state.refs[positionsKey] = positions;
    entity.show = positions.length >= 2;
  }

  function syncLiveTrails(snapshot) {
    const geometry = snapshot?.geometry;
    if (!geometry) return;

    syncLiveTrail(
      geometry.target_orbit_km,
      geometry._target_path_progress ?? closestPathIndex(geometry.target_orbit_km, geometry.target_position_km),
      geometry.target_position_km,
      "targetTrailSegments",
      TARGET_COLOR,
    );
    syncLiveTrail(
      geometry.secondary_orbit_km,
      geometry._secondary_path_progress ?? closestPathIndex(geometry.secondary_orbit_km, geometry.secondary_position_km),
      geometry.secondary_position_km,
      "secondaryTrailSegments",
      SECONDARY_COLOR,
    );
  }

  // app.js calls this from updateEntityGeometry. Keep the same signature, but route
  // it to the dynamic single-polyline trail system above.
  updateTrailSegments = function patchedUpdateTrailSegments(path, progress, currentPosition, refKey, color) {
    syncLiveTrail(path, progress, currentPosition, refKey, color);
  };

  function positiveRiskMagnitude(snapshot) {
    const risk = Number(snapshot?.current_risk_log10);
    if (!Number.isFinite(risk)) return "—";
    return Math.abs(risk).toFixed(2);
  }

  function patchRiskMetric(snapshot) {
    const labels = metricsEl.querySelectorAll(".metric .label");
    for (const label of labels) {
      if (label.textContent.trim() !== "Risk log10") continue;
      label.textContent = "Risk magnitude";
      const value = label.parentElement?.querySelector(".value");
      if (value) value.textContent = positiveRiskMagnitude(snapshot);
    }
  }

  const originalRenderMetrics = renderMetrics;
  renderMetrics = function patchedRenderMetrics(event, snapshot) {
    originalRenderMetrics(event, snapshot);
    patchRiskMetric(snapshot);
  };

  function cameraDistanceToCurrentCenter() {
    if (!state.displaySnapshot) return null;
    const center = eventCenter(state.displaySnapshot);
    const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, center);
    return Number.isFinite(distance) ? distance : null;
  }

  // Preserve the user's current zoom when focusing/changing horizons. This still
  // recenters the event, but it stops snapping the camera range back to default.
  centerCameraOnSnapshot = function patchedCenterCameraOnSnapshot(snapshot) {
    const center = eventCenter(snapshot);
    const currentRange = cameraDistanceToCurrentCenter();
    const fallbackRange = cameraRangeForSnapshot(snapshot);
    const range = clamp(currentRange ?? fallbackRange, viewer.scene.screenSpaceCameraController.minimumZoomDistance, viewer.scene.screenSpaceCameraController.maximumZoomDistance);
    const offset = new Cesium.HeadingPitchRange(0.0, -0.42, range);
    viewer.trackedEntity = undefined;
    viewer.camera.lookAt(center, offset);
    applyLabelFade();
  };

  function labelColor(color, alpha) {
    return new Cesium.ConstantProperty(color.withAlpha(alpha));
  }

  function setLabelFade(entity, alpha, backgroundAlpha = 0.45) {
    if (!entity?.label) return;
    const show = alpha > 0.025;
    entity.label.show = show;
    entity.label.fillColor = labelColor(Cesium.Color.WHITE, alpha);
    entity.label.backgroundColor = labelColor(Cesium.Color.BLACK, backgroundAlpha * alpha);
  }

  applyLabelFade = function patchedApplyLabelFade() {
    if (!state.refs.targetObject || !state.displaySnapshot) return;

    labelFadeState.target = labelAlphaForCamera();
    labelFadeState.current += (labelFadeState.target - labelFadeState.current) * LABEL_FADE_EASE;
    const alpha = clamp(labelFadeState.current, 0, 1);

    setLabelFade(state.refs.targetObject, alpha, 0.45);
    setLabelFade(state.refs.secondaryObject, alpha, 0.45);
    setLabelFade(state.refs.closestApproach, state.hovered === "center" ? alpha : 0, 0.55);
  };

  const originalRenderSnapshot = renderSnapshot;
  renderSnapshot = function patchedRenderSnapshot(snapshot, track = false) {
    originalRenderSnapshot(snapshot, track);
    syncLiveTrails(snapshot);
    patchRiskMetric(snapshot);
    applyLabelFade();
  };

  // Lightweight frame pump. It only updates two CallbackProperty arrays and label
  // alpha, so it avoids the entity churn that made trails disappear earlier.
  function liveFrame() {
    if (state.displaySnapshot) {
      syncLiveTrails(state.displaySnapshot);
      applyLabelFade();
      viewer.scene.requestRender();
    }
    requestAnimationFrame(liveFrame);
  }
  requestAnimationFrame(liveFrame);

  window.__BEACON_LIVE_TRAILS_PATCHED__ = true;
})();
