// Keep Cesium's left-click rotation pivot attached to the moving conjunction.
// This runs last so it can repair any earlier tracking/scrub patches that used setView().
(function patchMovingCameraPivot() {
  let patched = false;

  function localCameraOffset(center) {
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const inverse = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    return Cesium.Matrix4.multiplyByPoint(inverse, viewer.camera.positionWC, new Cesium.Cartesian3());
  }

  function keepPivotOnSnapshot(snapshot) {
    if (!trackToggle?.checked || !snapshot?.geometry) return;

    const center = eventCenter(snapshot);
    const offset = localCameraOffset(center);
    const range = Cesium.Cartesian3.magnitude(offset);

    if (!Number.isFinite(range) || range < 1000) return;

    viewer.trackedEntity = undefined;
    viewer.camera.lookAt(center, offset);
    viewer.scene.requestRender();
  }

  function patchRenderSnapshot() {
    if (patched || typeof renderSnapshot !== "function") return;
    patched = true;

    const previousRenderSnapshot = renderSnapshot;
    renderSnapshot = function pivotStableRenderSnapshot(snapshot, track = false) {
      previousRenderSnapshot(snapshot, track);

      // Focus Event gives Cesium the correct orbit pivot. As horizons/scrub/play
      // move the dots, keep that same pivot attached to the current event center
      // instead of letting camera.setView leave rotation around a stale origin.
      if (track && trackToggle.checked) {
        keepPivotOnSnapshot(snapshot);
      }
    };
  }

  function patchFocusButton() {
    if (typeof focusEvent !== "function" || focusEvent.__beaconPivotPatched) return;

    const originalFocusEvent = focusEvent;
    focusEvent = function pivotStableFocusEvent() {
      originalFocusEvent();
      keepPivotOnSnapshot(state.displaySnapshot || currentSnapshot());
    };
    focusEvent.__beaconPivotPatched = true;
  }

  function frame() {
    patchRenderSnapshot();
    patchFocusButton();

    if (trackToggle?.checked && state.displaySnapshot) {
      keepPivotOnSnapshot(state.displaySnapshot);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_CAMERA_PIVOT_FOLLOWS_EVENT__ = true;
})();
