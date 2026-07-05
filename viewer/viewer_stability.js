// Stabilize camera and label behavior after the live-trail patch.
(function patchViewerStability() {
  const LABEL_EASE = 0.18;
  let labelAlpha = 1;

  centerCameraOnSnapshot = function stableCenterCameraOnSnapshot(snapshot) {
    const center = eventCenter(snapshot);
    const range = cameraRangeForSnapshot(snapshot);
    viewer.trackedEntity = undefined;
    viewer.camera.lookAt(center, new Cesium.HeadingPitchRange(0.0, -0.42, range));
    applyLabelFade();
  };

  function colorProperty(color, alpha) {
    return new Cesium.ConstantProperty(color.withAlpha(alpha));
  }

  function paintLabel(entity, alpha, backgroundScale) {
    if (!entity || !entity.label) return;
    const a = clamp(alpha, 0, 1);
    const visible = a > 0.025;
    entity.label.show = visible;
    entity.label.showBackground = visible;
    entity.label.fillColor = colorProperty(Cesium.Color.WHITE, a);
    entity.label.outlineColor = colorProperty(Cesium.Color.BLACK, a);
    entity.label.backgroundColor = colorProperty(Cesium.Color.BLACK, backgroundScale * a);
  }

  applyLabelFade = function stableApplyLabelFade() {
    if (!state.refs.targetObject || !state.displaySnapshot) return;
    const targetAlpha = labelAlphaForCamera();
    labelAlpha += (targetAlpha - labelAlpha) * LABEL_EASE;
    paintLabel(state.refs.targetObject, labelAlpha, 0.45);
    paintLabel(state.refs.secondaryObject, labelAlpha, 0.45);
    paintLabel(state.refs.closestApproach, state.hovered === "center" ? labelAlpha : 0, 0.55);
    viewer.scene.requestRender();
  };

  function frame() {
    applyLabelFade();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_CAMERA_STABLE__ = true;
})();
