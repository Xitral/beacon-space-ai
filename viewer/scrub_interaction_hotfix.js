// Scrubber and camera-pivot interaction fixes that run after the existing BEACON viewer patches.
(function patchScrubInteractionConflicts() {
  let wired = false;
  let renderPatched = false;

  function pausePlayHorizons() {
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
      if (playButton) playButton.textContent = "Play horizons";
    }
  }

  function localCameraOffset(center) {
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const inverse = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    return Cesium.Matrix4.multiplyByPoint(inverse, viewer.camera.positionWC, new Cesium.Cartesian3());
  }

  function keepRotationPivotOnSnapshot(snapshot) {
    if (!trackToggle?.checked || !snapshot?.geometry || !viewer?.camera) return false;

    const center = eventCenter(snapshot);
    const offset = localCameraOffset(center);
    const range = Cesium.Cartesian3.magnitude(offset);

    if (!Number.isFinite(range) || range < 1000) return false;

    viewer.trackedEntity = undefined;
    viewer.camera.lookAt(center, offset);
    viewer.scene.requestRender();
    return true;
  }

  function resetCameraPivotPreservingView() {
    if (!viewer?.camera) return;

    // When tracking is enabled, keep the Cesium rotation pivot attached to the
    // moving conjunction center. This preserves the normal Focus Event left-click
    // orbit behavior even after horizons/scrubbing move the dots.
    if (keepRotationPivotOnSnapshot(state.displaySnapshot || currentSnapshot())) return;

    // When tracking is disabled, reset back to the normal world frame without
    // moving the visible camera view.
    const camera = viewer.camera;
    const destination = Cesium.Cartesian3.clone(camera.positionWC);
    const direction = Cesium.Cartesian3.clone(camera.directionWC);
    const up = Cesium.Cartesian3.clone(camera.upWC);

    viewer.trackedEntity = undefined;
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({ destination, orientation: { direction, up } });
    viewer.scene.requestRender();
  }

  function handleScrubStart() {
    pausePlayHorizons();
    resetCameraPivotPreservingView();
    window.__BEACON_RESEARCH_SCRUBBING__ = true;
  }

  function handleScrubMove() {
    pausePlayHorizons();
    requestAnimationFrame(resetCameraPivotPreservingView);
  }

  function handleScrubEnd() {
    pausePlayHorizons();
    requestAnimationFrame(() => {
      resetCameraPivotPreservingView();
      window.__BEACON_RESEARCH_SCRUBBING__ = false;
    });
  }

  function wireScrubber() {
    if (wired) return;
    const scrubber = document.getElementById("researchScrubber");
    if (!scrubber) return;
    wired = true;

    scrubber.addEventListener("pointerdown", handleScrubStart, true);
    scrubber.addEventListener("input", handleScrubMove, true);
    scrubber.addEventListener("change", handleScrubMove, true);
    scrubber.addEventListener("pointerup", handleScrubEnd, true);
    scrubber.addEventListener("pointercancel", handleScrubEnd, true);
  }

  function patchRenderSnapshot() {
    if (renderPatched || typeof renderSnapshot !== "function") return;
    renderPatched = true;

    const previousRenderSnapshot = renderSnapshot;
    renderSnapshot = function pivotStableRenderSnapshot(snapshot, track = false) {
      previousRenderSnapshot(snapshot, track);
      if (track && trackToggle.checked) keepRotationPivotOnSnapshot(snapshot);
    };
  }

  function frame() {
    wireScrubber();
    patchRenderSnapshot();
    if (trackToggle?.checked && state.displaySnapshot) keepRotationPivotOnSnapshot(state.displaySnapshot);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_SCRUB_PAUSES_PLAY__ = true;
  window.__BEACON_CAMERA_PIVOT_RESET_ON_SCRUB__ = true;
  window.__BEACON_CAMERA_PIVOT_FOLLOWS_EVENT__ = true;
})();
