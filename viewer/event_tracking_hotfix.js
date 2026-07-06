// Make event switching and playback respect the Track selected event toggle.
(function patchEventTrackingToggle() {
  if (typeof setEvent === "function") {
    setEvent = function patchedSetEvent(index) {
      stopAnimation();
      state.eventIndex = Number(index);
      state.horizonIndex = 0;
      state.displaySnapshot = currentSnapshot();
      populateHorizonSelect();
      state.hovered = null;
      updateHoverLabels();

      // Only move/focus the camera when tracking is actually enabled.
      // With tracking disabled, changing events updates the scene in place.
      renderScene(trackToggle.checked);
    };
  }

  if (typeof togglePlay === "function") {
    togglePlay = function patchedTogglePlay() {
      if (state.playTimer) {
        clearInterval(state.playTimer);
        state.playTimer = null;
        playButton.textContent = "Play horizons";
        return;
      }

      // Preserve the user's tracking choice. Playback should animate the horizons,
      // not silently re-enable camera tracking.
      const shouldTrackDuringPlayback = trackToggle.checked;
      playButton.textContent = "Pause";

      state.playTimer = setInterval(() => {
        const event = currentEvent();
        const next = (state.horizonIndex + 1) % event.snapshots.length;
        transitionToHorizon(next, { smooth: smoothToggle.checked });

        if (!shouldTrackDuringPlayback) {
          trackToggle.checked = false;
          viewer.trackedEntity = undefined;
        }
      }, smoothToggle.checked ? 1250 : 900);
    };
  }

  window.__BEACON_EVENT_TRACKING_TOGGLE_RESPECTED__ = true;
  window.__BEACON_PLAY_RESPECTS_TRACKING__ = true;
})();
