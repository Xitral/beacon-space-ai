// Live trail alignment patch for the Cesium viewer.
//
// This renderer keeps the visible trail head locked to the live object dot by
// splitting the active orbit segment at the current interpolated position. It is
// intentionally event-driven only: app.js calls updateTrailSegments every time a
// prediction-horizon interpolation frame is drawn, so no preRender entity churn is
// needed.

(function patchLiveOrbitTrails() {
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

  function trailAlphaAtMidpoint(midpoint, progress, length) {
    const behindDistance = wrapIndex(progress - midpoint, length);
    const raw = 1 - behindDistance / length;
    const eased = Math.pow(clamp(raw, 0, 1), 1.7);
    return eased < 0.025 ? 0 : clamp(eased, 0, 0.96);
  }

  function buildLiveTrailSegments(path, progress, currentPosition) {
    const length = effectivePathLength(path);
    if (length < 2) return [];

    const liveProgress = closestProgressOnPath(path, currentPosition, progress);
    const wrappedProgress = wrapIndex(liveProgress, length);
    const activeIndex = Math.floor(wrappedProgress);
    const frac = wrappedProgress - activeIndex;
    const livePoint = currentPosition || samplePath(path, wrappedProgress);
    const segments = [];

    for (let i = 0; i < length; i += 1) {
      const p0 = path[i];
      const p1 = path[(i + 1) % length];

      if (i === activeIndex) {
        // Segment behind the object: terminate exactly at the dot.
        if (frac > 1e-6) {
          segments.push({
            start: p0,
            end: livePoint,
            alpha: trailAlphaAtMidpoint(i + frac * 0.5, wrappedProgress, length),
          });
        }

        // Segment ahead of the object: begin exactly at the dot, but keep it
        // mostly transparent so the direction of travel is still readable.
        if (frac < 1 - 1e-6) {
          segments.push({
            start: livePoint,
            end: p1,
            alpha: 0.04,
          });
        }
      } else {
        const alpha = trailAlphaAtMidpoint(i + 0.5, wrappedProgress, length);
        segments.push({ start: p0, end: p1, alpha });
      }
    }

    return segments;
  }

  function makeSegmentEntity(refKey, color) {
    const entity = viewer.entities.add({
      name: `${refKey} live segment`,
      polyline: {
        positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.ZERO],
        width: 2.7,
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

    const displaySegments = buildLiveTrailSegments(path, progress, currentPosition);
    const entities = ensureLiveTrailSegments(refKey, displaySegments.length, color);

    for (let i = 0; i < displaySegments.length; i += 1) {
      const segment = displaySegments[i];
      entities[i].polyline.positions = pathToCartesianPair(segment.start, segment.end);
      entities[i].polyline.material = new Cesium.ColorMaterialProperty(color.withAlpha(segment.alpha));
      entities[i].show = segment.alpha > 0.01;
    }
    viewer.scene.requestRender();
  }

  updateTrailSegments = updateLiveTrailSegments;
  window.__BEACON_LIVE_TRAILS_PATCHED__ = true;
})();
