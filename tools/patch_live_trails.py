from pathlib import Path

app = Path("viewer/app.js")
text = app.read_text(encoding="utf-8")

# Fix Cesium material-property crash if this reset removed the prior fix.
text = text.replace(
    "material: color.withAlpha(0),",
    "material: new Cesium.ColorMaterialProperty(color.withAlpha(0)),",
)
text = text.replace(
    "segments[i].polyline.material = new Cesium.ConstantProperty(color.withAlpha(alpha));",
    "segments[i].polyline.material = new Cesium.ColorMaterialProperty(color.withAlpha(alpha));",
)
text = text.replace(
    "state.refs.separation.polyline.material = new Cesium.ConstantProperty(SEPARATION_COLOR);",
    "state.refs.separation.polyline.material = new Cesium.ColorMaterialProperty(SEPARATION_COLOR);",
)

new_trail_block = '''function trailAlphaAtMidpoint(midpoint, progress, length) {
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

'''

start = text.find("function trailAlpha(")
end = text.find("function labelAlphaForCamera()")

if start != -1 and end != -1:
    text = text[:start] + new_trail_block + text[end:]
elif "function buildDisplayedTrailSegments(" not in text:
    raise SystemExit("Could not find trail block to replace.")

text = text.replace(
'''  updateTrailSegments(
    geometry.target_orbit_km,
    geometry._target_path_progress ?? closestPathIndex(geometry.target_orbit_km, geometry.target_position_km),
    "targetTrailSegments",
    TARGET_COLOR,
  );''',
'''  updateTrailSegments(
    geometry.target_orbit_km,
    geometry._target_path_progress ?? closestPathIndex(geometry.target_orbit_km, geometry.target_position_km),
    geometry.target_position_km,
    "targetTrailSegments",
    TARGET_COLOR,
  );'''
)

text = text.replace(
'''  updateTrailSegments(
    geometry.secondary_orbit_km,
    geometry._secondary_path_progress ?? closestPathIndex(geometry.secondary_orbit_km, geometry.secondary_position_km),
    "secondaryTrailSegments",
    SECONDARY_COLOR,
  );''',
'''  updateTrailSegments(
    geometry.secondary_orbit_km,
    geometry._secondary_path_progress ?? closestPathIndex(geometry.secondary_orbit_km, geometry.secondary_position_km),
    geometry.secondary_position_km,
    "secondaryTrailSegments",
    SECONDARY_COLOR,
  );'''
)

app.write_text(text, encoding="utf-8")
