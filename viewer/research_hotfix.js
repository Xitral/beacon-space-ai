// Final viewer polish layer.
// Loaded after app.js/live_trails.js so it can correct interaction behavior without
// disturbing the research overlays.
(function patchResearchHotfixes() {
  const MAP_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/640px-Equirectangular_projection_SW.jpg";
  const CAMERA_FOLLOW_LERP = 0.42;
  let scrubberTrackingWired = false;
  let followFrameQueued = false;

  function injectHotfixCss() {
    if (document.getElementById("researchHotfixStyles")) return;
    const style = document.createElement("style");
    style.id = "researchHotfixStyles";
    style.textContent = `
      html,body{width:100%!important;max-width:100vw!important;overflow:hidden!important}
      #panel,#researchDock{overflow-x:hidden!important;contain:paint;max-width:calc(100vw - 36px)!important}
      #panel *,#researchDock *{max-width:100%;min-width:0}#panel select,#panel button,#researchDock button,#researchDock input{max-width:100%;min-width:0}
      #panel::-webkit-scrollbar-corner,#researchDock::-webkit-scrollbar-corner{display:none;background:transparent}
      #researchTimeline{left:clamp(420px,44vw,620px)!important;right:clamp(24px,26vw,390px)!important;max-width:calc(100vw - 48px)!important;overflow:hidden!important;box-sizing:border-box!important}
      #researchTimeline input{display:block;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
      #groundTrackWrap{position:relative;width:100%;height:150px;overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:#071a30;background-image:linear-gradient(rgba(5,12,25,.10),rgba(5,12,25,.30)),url("${MAP_IMAGE_URL}");background-size:100% 100%;background-position:center;background-repeat:no-repeat;box-shadow:inset 0 0 24px rgba(0,0,0,.28)}
      #groundTrackWrap canvas,#groundTrack{position:absolute;inset:0;width:100%!important;height:100%!important;border:0!important;border-radius:0!important;background:transparent!important}
      @media(max-width:1050px){#researchTimeline{left:24px!important;right:24px!important}#researchDock{display:none!important}}`;
    document.head.appendChild(style);
  }

  function ensureMapWrapper() {
    const canvas = document.getElementById("groundTrack");
    if (!canvas || canvas.parentElement?.id === "groundTrackWrap") return;
    const wrapper = document.createElement("div");
    wrapper.id = "groundTrackWrap";
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);
  }

  function project(point, width, height) {
    const r = Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2) || 1;
    const lon = Math.atan2(point[1], point[0]);
    const lat = Math.asin(clamp(point[2] / r, -1, 1));
    return [width * (lon + Math.PI) / (2 * Math.PI), height * (0.5 - lat / Math.PI)];
  }

  function redrawMapOverlay() {
    const canvas = document.getElementById("groundTrack");
    const snapshot = state.displaySnapshot;
    const geometry = snapshot?.geometry;
    if (!canvas || !geometry) return;

    ensureMapWrapper();
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = "rgba(205,230,255,.18)";
    ctx.lineWidth = 1;
    for (let lon = -120; lon <= 120; lon += 60) {
      const x = (lon + 180) / 360 * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let lat = -45; lat <= 45; lat += 45) {
      const y = (90 - lat) / 180 * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    function drawPath(points, color) {
      if (!Array.isArray(points) || points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = project(point, width, height);
        if (index === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    }

    drawPath(geometry.target_orbit_km, "rgba(87,165,255,.95)");
    drawPath(geometry.secondary_orbit_km, "rgba(255,184,77,.95)");

    for (const [point, color] of [[geometry.target_position_km, "#57a5ff"], [geometry.secondary_position_km, "#ffb84d"]]) {
      if (!Array.isArray(point)) continue;
      const p = project(point, width, height);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function correctedUp(direction, preferredUp) {
    const right = Cesium.Cartesian3.cross(direction, preferredUp, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(right) < 1e-5) return Cesium.Cartesian3.clone(preferredUp);
    Cesium.Cartesian3.normalize(right, right);
    const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(up, up);
    return up;
  }

  function smoothTrackDisplayedSnapshot(immediate = false) {
    if (!trackToggle?.checked || !state.displaySnapshot) return;
    const center = eventCenter(state.displaySnapshot);
    const camera = viewer.camera;
    const currentPosition = Cesium.Cartesian3.clone(camera.positionWC);
    const currentDirection = Cesium.Cartesian3.clone(camera.directionWC);
    const currentUp = Cesium.Cartesian3.clone(camera.upWC);
    const range = Cesium.Cartesian3.distance(currentPosition, center);

    if (!Number.isFinite(range) || range <= 1) return;

    const desiredOffset = Cesium.Cartesian3.multiplyByScalar(currentDirection, -range, new Cesium.Cartesian3());
    const desiredPosition = Cesium.Cartesian3.add(center, desiredOffset, new Cesium.Cartesian3());
    const destination = immediate
      ? desiredPosition
      : Cesium.Cartesian3.lerp(currentPosition, desiredPosition, CAMERA_FOLLOW_LERP, new Cesium.Cartesian3());

    const direction = Cesium.Cartesian3.subtract(center, destination, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);
    const up = correctedUp(direction, currentUp);

    viewer.trackedEntity = undefined;
    camera.setView({ destination, orientation: { direction, up } });
    viewer.scene.requestRender();
  }

  function queueSmoothTrack(immediate = false) {
    if (followFrameQueued && !immediate) return;
    followFrameQueued = true;
    requestAnimationFrame(() => {
      followFrameQueued = false;
      smoothTrackDisplayedSnapshot(immediate);
    });
  }

  function wireScrubberTracking() {
    if (scrubberTrackingWired) return;
    const scrubber = document.getElementById("researchScrubber");
    if (!scrubber) return;
    scrubberTrackingWired = true;

    scrubber.addEventListener("pointerdown", () => {
      window.__BEACON_RESEARCH_SCRUBBING__ = true;
    });
    scrubber.addEventListener("input", () => {
      window.__BEACON_RESEARCH_SCRUBBING__ = true;
      queueSmoothTrack(false);
    });
    scrubber.addEventListener("change", () => {
      queueSmoothTrack(false);
    });
    scrubber.addEventListener("pointerup", () => {
      requestAnimationFrame(() => {
        smoothTrackDisplayedSnapshot(false);
        window.__BEACON_RESEARCH_SCRUBBING__ = false;
      });
    });
    scrubber.addEventListener("pointercancel", () => {
      window.__BEACON_RESEARCH_SCRUBBING__ = false;
    });
  }

  if (typeof renderSnapshot === "function") {
    const previousRenderSnapshot = renderSnapshot;
    renderSnapshot = function hotfixedRenderSnapshot(snapshot, track = false) {
      previousRenderSnapshot(snapshot, false);
      if (track && trackToggle.checked && !window.__BEACON_RESEARCH_SCRUBBING__) {
        queueSmoothTrack(false);
      }
      redrawMapOverlay();
    };
  }

  if (typeof transitionToHorizon === "function") {
    const previousTransitionToHorizon = transitionToHorizon;
    transitionToHorizon = function hotfixedTransitionToHorizon(index, options = {}) {
      const targetIndex = Number(index);
      if (targetIndex === 0) {
        previousTransitionToHorizon(targetIndex, { ...options, smooth: false });
        return;
      }
      previousTransitionToHorizon(targetIndex, options);
    };
  }

  function frame() {
    injectHotfixCss();
    ensureMapWrapper();
    wireScrubberTracking();
    redrawMapOverlay();
    if (window.__BEACON_RESEARCH_SCRUBBING__) queueSmoothTrack(false);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_RESEARCH_HOTFIXES__ = true;
})();
