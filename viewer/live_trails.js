// Live trail alignment patch for the Cesium viewer.
//
// This renderer intentionally draws a moving comet-style trail behind each object
// instead of a mostly-static full-orbit gradient. app.js calls updateTrailSegments
// for every prediction-horizon interpolation frame, so the final trail segment is
// rebuilt to terminate exactly at the current interpolated dot position.

(function patchLiveOrbitTrails() {
  const TRAIL_FRACTION_OF_ORBIT = 0.32;
  const TRAIL_SEGMENT_COUNT = 48;

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

  function sampleLivePath(path, progress, liveProgress, livePoint) {
    if (Math.abs(progress - liveProgress) < 1e-6) return livePoint;
    return samplePath(path, progress);
  }

  function buildMovingTrailSegments(path, progress, currentPosition) {
    const length = effectivePathLength(path);
    if (length < 2) return [];

    const liveProgress = closestProgressOnPath(path, currentPosition, progress);
    const livePoint = currentPosition || samplePath(path, liveProgress);
    const trailLength = Math.max(2, length * TRAIL_FRACTION_OF_ORBIT);
    const segmentCount = Math.min(TRAIL_SEGMENT_COUNT, Math.max(8, Math.round(trailLength)));
    const startProgress = liveProgress - trailLength;
    const points = [];

    for (let i = 0; i <= segmentCount; i += 1) {
      const t = i / segmentCount;
      const p = startProgress + trailLength * t;
      points.push(sampleLivePath(path, p, liveProgress, livePoint));
    }

    // The final point must be the exact object position used by app.js for the dot.
    points[points.length - 1] = livePoint;

    const segments = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const t = (i + 1) / (points.length - 1);
      const alpha = clamp(0.08 + Math.pow(t, 1.7) * 0.88, 0.08, 0.96);
      segments.push({ start: points[i], end: points[i + 1], alpha });
    }

    return segments;
  }

  function makeSegmentEntity(refKey, color) {
    const entity = viewer.entities.add({
      name: `${refKey} moving trail segment`,
      polyline: {
        positions: new Cesium.ConstantProperty([Cesium.Cartesian3.ZERO, Cesium.Cartesian3.ZERO]),
        width: 3.0,
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0)),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
      },
    });
    state.refs[refKey].push(entity);
    return entity;
  }

  function ensureLiveTrailSegments(refKey, count, color) {
    if (!state.refs[refKey]) state.refs[refKey] = [];
    while (state.refs[refKey].length < count) {
      makeSegmentEntity(refKey, color);
    }
    while (state.refs[refKey].length > count) {
      const entity = state.refs[refKey].pop();
      viewer.entities.remove(entity);
    }
    return state.refs[refKey];
  }

  function updateLiveTrailSegments(path, progress, currentPosition, refKey, color) {
    const length = effectivePathLength(path);
    if (length < 2) return;

    const displaySegments = buildMovingTrailSegments(path, progress, currentPosition);
    const entities = ensureLiveTrailSegments(refKey, displaySegments.length, color);

    for (let i = 0; i < displaySegments.length; i += 1) {
      const segment = displaySegments[i];
      entities[i].polyline.positions = new Cesium.ConstantProperty(
        pathToCartesianPair(segment.start, segment.end),
      );
      entities[i].polyline.material = new Cesium.ColorMaterialProperty(color.withAlpha(segment.alpha));
      entities[i].show = true;
    }

    viewer.scene.requestRender();
  }

  updateTrailSegments = updateLiveTrailSegments;
  window.__BEACON_LIVE_TRAILS_PATCHED__ = true;
})();
