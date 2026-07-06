// Consolidated BEACON research-viewer runtime.
// This replaces the earlier hotfix layer with one named runtime module for
// viewer polish, research exports, tracking behavior, and uncertainty display.
(function beaconResearchRuntime() {
  const MAP_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/640px-Equirectangular_projection_SW.jpg";
  const SIGMA_FLOOR_KM = 100;
  const SIGMA_PER_PROB_STD_KM = 1800;
  const SIGMA_PER_DAY_KM = 45;
  const CONFIDENCE_95 = 1.96;

  const runtime = {
    cssInjected: false,
    panelScrollReady: false,
    panelScrollDragging: false,
    playInterceptReady: false,
    scrubReady: false,
    renderPatched: false,
    exportUiReady: false,
    figureMode: false,
  };

  function safeClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function probabilityHeat(snapshot) {
    const risk = numeric(snapshot?.current_risk_log10, -9);
    const model = numeric(snapshot?.model_probability, 0);
    const uncertainty = numeric(snapshot?.predictive_std, 0);
    const riskHeat = Number.isFinite(risk) ? safeClamp((risk + 7.5) / 4.5, 0, 1) : 0;
    return safeClamp(riskHeat * 0.56 + model * 0.24 + uncertainty * 1.30, 0, 1);
  }

  function uncertaintyModel(snapshot) {
    const std = Math.max(0, numeric(snapshot?.predictive_std, 0));
    const days = Math.max(0, numeric(snapshot?.time_to_tca_days, 0));
    const risk = probabilityHeat(snapshot);
    const sigmaKm = safeClamp(SIGMA_FLOOR_KM + std * SIGMA_PER_PROB_STD_KM + days * SIGMA_PER_DAY_KM, 80, 4200);
    return {
      std,
      days,
      heat: risk,
      sigmaKm,
      envelopeKm: sigmaKm * CONFIDENCE_95,
      opacity: safeClamp(0.12 + risk * 0.26 + std * 0.55, 0.14, 0.46),
    };
  }

  function injectRuntimeCss() {
    if (runtime.cssInjected) return;
    runtime.cssInjected = true;
    const style = document.createElement("style");
    style.id = "beaconResearchRuntimeStyles";
    style.textContent = `
      html,body{width:100%!important;max-width:100vw!important;overflow:hidden!important}
      #panel{scrollbar-width:none!important;-ms-overflow-style:none!important;padding-right:28px!important;clip-path:inset(0 round 18px);overflow-x:hidden!important;contain:paint;max-width:calc(100vw - 36px)!important}
      #panel::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}#panel::-webkit-scrollbar-button{display:none!important}
      #panel *,#researchDock *{max-width:100%;min-width:0;box-sizing:border-box}#panel select,#panel button,#researchDock button,#researchDock input{max-width:100%;min-width:0}
      #researchDock{overflow-x:hidden!important;contain:paint}
      #researchTimeline{left:clamp(420px,44vw,620px)!important;right:clamp(24px,26vw,390px)!important;width:auto!important;max-width:calc(100vw - 48px)!important;overflow:hidden!important;box-sizing:border-box!important}
      #researchTimeline input[type="range"]{display:block;width:calc(100% - 4px)!important;max-width:calc(100% - 4px)!important;min-width:0!important;margin-left:2px!important;margin-right:2px!important;box-sizing:border-box!important}
      #groundTrackWrap{position:relative;width:100%;height:150px;overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:#071a30;background-image:linear-gradient(rgba(5,12,25,.10),rgba(5,12,25,.30)),url("${MAP_IMAGE_URL}");background-size:100% 100%;background-position:center;background-repeat:no-repeat;box-shadow:inset 0 0 24px rgba(0,0,0,.28)}
      #groundTrackWrap canvas,#groundTrack{position:absolute;inset:0;width:100%!important;height:100%!important;border:0!important;border-radius:0!important;background:transparent!important}
      #beaconPanelScrollRail{position:fixed;width:8px;border-radius:999px;background:rgba(8,15,28,.36);box-shadow:inset 0 0 0 1px rgba(126,177,255,.12);z-index:140;pointer-events:none}
      #beaconPanelScrollThumb{position:absolute;left:1px;width:6px;border-radius:999px;background:linear-gradient(180deg,rgba(132,179,255,.95),rgba(87,165,255,.48));box-shadow:0 0 18px rgba(87,165,255,.24);pointer-events:auto;cursor:grab}#beaconPanelScrollThumb:active{cursor:grabbing;background:linear-gradient(180deg,rgba(172,204,255,1),rgba(87,165,255,.68))}
      .beacon-export-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.beacon-export-row button{border:1px solid rgba(126,177,255,.28);border-radius:10px;background:rgba(87,165,255,.12);color:#eef6ff;padding:8px;font-weight:800;cursor:pointer}.beacon-export-row button:hover{background:rgba(87,165,255,.22)}
      .beacon-uncertainty-formula{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:#cfe1ff;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin-top:8px;line-height:1.35}
      body.beacon-exporting #panel,body.beacon-exporting #researchDock,body.beacon-exporting #researchTimeline,body.beacon-exporting #beaconPanelScrollRail{display:none!important}
      body.beacon-figure-mode #panel,body.beacon-figure-mode #researchTimeline,body.beacon-figure-mode #beaconPanelScrollRail{display:none!important}
      body.beacon-figure-mode #researchDock{opacity:.22;transition:opacity .15s ease}body.beacon-figure-mode #researchDock:hover{opacity:1}
      @media(max-width:1050px){#researchTimeline{left:24px!important;right:24px!important}#researchDock{display:none!important}}
    `;
    document.head.appendChild(style);
  }

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

  function resetCameraFramePreservingView() {
    if (!viewer?.camera) return;
    if (keepRotationPivotOnSnapshot(state.displaySnapshot || currentSnapshot())) return;
    const camera = viewer.camera;
    const destination = Cesium.Cartesian3.clone(camera.positionWC);
    const direction = Cesium.Cartesian3.clone(camera.directionWC);
    const up = Cesium.Cartesian3.clone(camera.upWC);
    viewer.trackedEntity = undefined;
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({ destination, orientation: { direction, up } });
    viewer.scene.requestRender();
  }

  function ensurePanelScrollbar() {
    const panel = document.getElementById("panel");
    if (!panel) return;
    let rail = document.getElementById("beaconPanelScrollRail");
    let thumb = document.getElementById("beaconPanelScrollThumb");
    if (!rail) {
      rail = document.createElement("div");
      rail.id = "beaconPanelScrollRail";
      thumb = document.createElement("div");
      thumb.id = "beaconPanelScrollThumb";
      rail.appendChild(thumb);
      document.body.appendChild(rail);
    }
    if (runtime.panelScrollReady || !thumb) return;
    runtime.panelScrollReady = true;
    let startY = 0;
    let startScrollTop = 0;
    thumb.addEventListener("pointerdown", (event) => {
      runtime.panelScrollDragging = true;
      startY = event.clientY;
      startScrollTop = panel.scrollTop;
      thumb.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    thumb.addEventListener("pointermove", (event) => {
      if (!runtime.panelScrollDragging) return;
      const scrollMax = Math.max(1, panel.scrollHeight - panel.clientHeight);
      const railHeight = Math.max(1, rail.getBoundingClientRect().height);
      const thumbHeight = Math.max(44, railHeight * (panel.clientHeight / Math.max(panel.scrollHeight, 1)));
      const usable = Math.max(1, railHeight - thumbHeight);
      panel.scrollTop = startScrollTop + ((event.clientY - startY) / usable) * scrollMax;
      event.preventDefault();
    });
    thumb.addEventListener("pointerup", (event) => {
      runtime.panelScrollDragging = false;
      thumb.releasePointerCapture(event.pointerId);
    });
    thumb.addEventListener("pointercancel", () => { runtime.panelScrollDragging = false; });
  }

  function updatePanelScrollbar() {
    const panel = document.getElementById("panel");
    const rail = document.getElementById("beaconPanelScrollRail");
    const thumb = document.getElementById("beaconPanelScrollThumb");
    if (!panel || !rail || !thumb) return;
    const scrollMax = panel.scrollHeight - panel.clientHeight;
    if (scrollMax <= 2 || document.body.classList.contains("beacon-exporting")) {
      rail.style.display = "none";
      return;
    }
    const rect = panel.getBoundingClientRect();
    const railInset = 14;
    const railHeight = Math.max(40, rect.height - railInset * 2);
    const thumbHeight = Math.max(46, railHeight * (panel.clientHeight / panel.scrollHeight));
    const y = (railHeight - thumbHeight) * (panel.scrollTop / scrollMax);
    rail.style.display = "block";
    rail.style.left = `${Math.round(rect.right - 14)}px`;
    rail.style.top = `${Math.round(rect.top + railInset)}px`;
    rail.style.height = `${Math.round(railHeight)}px`;
    thumb.style.height = `${Math.round(thumbHeight)}px`;
    thumb.style.transform = `translateY(${Math.round(y)}px)`;
  }

  function ensureMapWrapper() {
    const canvas = document.getElementById("groundTrack");
    if (!canvas || canvas.parentElement?.id === "groundTrackWrap") return;
    const wrapper = document.createElement("div");
    wrapper.id = "groundTrackWrap";
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);
  }

  function projectMap(point, width, height) {
    const r = Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2) || 1;
    const lon = Math.atan2(point[1], point[0]);
    const lat = Math.asin(safeClamp(point[2] / r, -1, 1));
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
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let lat = -45; lat <= 45; lat += 45) {
      const y = (90 - lat) / 180 * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    function drawPath(points, color) {
      if (!Array.isArray(points) || points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = projectMap(point, width, height);
        if (index === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    }
    drawPath(geometry.target_orbit_km, "rgba(87,165,255,.95)");
    drawPath(geometry.secondary_orbit_km, "rgba(255,184,77,.95)");
    for (const [point, color] of [[geometry.target_position_km, "#57a5ff"], [geometry.secondary_position_km, "#ffb84d"]]) {
      if (!Array.isArray(point)) continue;
      const p = projectMap(point, width, height);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  function styleLabels() {
    const labelEntities = [state.refs.targetObject, state.refs.secondaryObject, state.refs.closestApproach];
    for (const entity of labelEntities) {
      if (!entity?.label) continue;
      entity.label.font = "600 13px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      entity.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      entity.label.outlineColor = Cesium.Color.BLACK.withAlpha(0.88);
      entity.label.outlineWidth = 3;
      entity.label.showBackground = false;
      entity.label.backgroundColor = Cesium.Color.TRANSPARENT;
      entity.label.backgroundPadding = new Cesium.Cartesian2(0, 0);
      entity.label.pixelOffset = new Cesium.Cartesian2(0, -26);
      entity.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    }
  }

  function ensureUncertaintyHalo(name, color) {
    if (state.refs[name]) return state.refs[name];
    state.refs[name] = viewer.entities.add({
      name,
      position: Cesium.Cartesian3.ZERO,
      point: {
        pixelSize: 48,
        color: color.withAlpha(0.13),
        outlineColor: color.withAlpha(0.82),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    return state.refs[name];
  }

  function ensureResearchEllipsoid(name, color) {
    if (state.refs[name]) return state.refs[name];
    state.refs[name] = viewer.entities.add({
      name,
      position: Cesium.Cartesian3.ZERO,
      ellipsoid: {
        radii: new Cesium.Cartesian3(1, 1, 1),
        material: color.withAlpha(0.16),
        outline: true,
        outlineColor: color.withAlpha(0.55),
      },
    });
    return state.refs[name];
  }

  function syncScientificUncertainty(snapshot) {
    const geometry = snapshot?.geometry;
    if (!geometry) return;
    const model = uncertaintyModel(snapshot);
    const target = ensureResearchEllipsoid("researchTargetUncertainty", TARGET_COLOR);
    const secondary = ensureResearchEllipsoid("researchSecondaryUncertainty", SECONDARY_COLOR);
    const tca = ensureResearchEllipsoid("researchTcaVolume", SEPARATION_COLOR);
    const targetHalo = ensureUncertaintyHalo("researchTargetUncertaintyHalo", TARGET_COLOR);
    const secondaryHalo = ensureUncertaintyHalo("researchSecondaryUncertaintyHalo", SECONDARY_COLOR);

    const targetPos = kmToCartesian(geometry.target_position_km);
    const secondaryPos = kmToCartesian(geometry.secondary_position_km);
    const mid = eventCenter(snapshot);
    const sigmaM = model.sigmaKm * 1000;
    const envelopeM = model.envelopeKm * 1000;
    const relKm = Math.max(1, numeric(geometry.display_relative_distance_km || geometry.relative_distance_km, 1));
    const corridorKm = safeClamp(model.envelopeKm + relKm * 0.35, 150, 9000);
    const haloSize = safeClamp(34 + model.std * 360 + model.days * 4 + model.heat * 28, 38, 128);

    target.position = new Cesium.ConstantPositionProperty(targetPos);
    secondary.position = new Cesium.ConstantPositionProperty(secondaryPos);
    tca.position = new Cesium.ConstantPositionProperty(mid);

    target.ellipsoid.radii = new Cesium.Cartesian3(envelopeM, sigmaM * 1.20, sigmaM * 0.68);
    secondary.ellipsoid.radii = new Cesium.Cartesian3(envelopeM * 0.88, sigmaM * 1.05, sigmaM * 0.76);
    tca.ellipsoid.radii = new Cesium.Cartesian3(corridorKm * 1000, corridorKm * 780, corridorKm * 620);

    target.ellipsoid.material = TARGET_COLOR.withAlpha(model.opacity);
    secondary.ellipsoid.material = SECONDARY_COLOR.withAlpha(model.opacity * 0.92);
    tca.ellipsoid.material = SEPARATION_COLOR.withAlpha(safeClamp(model.opacity * 0.52, 0.08, 0.22));
    target.ellipsoid.outline = true;
    secondary.ellipsoid.outline = true;
    tca.ellipsoid.outline = true;
    target.ellipsoid.outlineColor = TARGET_COLOR.withAlpha(0.82);
    secondary.ellipsoid.outlineColor = SECONDARY_COLOR.withAlpha(0.78);
    tca.ellipsoid.outlineColor = SEPARATION_COLOR.withAlpha(0.58);
    target.show = true; secondary.show = true; tca.show = true;

    targetHalo.position = new Cesium.ConstantPositionProperty(targetPos);
    secondaryHalo.position = new Cesium.ConstantPositionProperty(secondaryPos);
    targetHalo.point.pixelSize = new Cesium.ConstantProperty(haloSize);
    secondaryHalo.point.pixelSize = new Cesium.ConstantProperty(haloSize * 0.94);
    targetHalo.point.color = new Cesium.ConstantProperty(TARGET_COLOR.withAlpha(0.12 + model.heat * 0.12));
    secondaryHalo.point.color = new Cesium.ConstantProperty(SECONDARY_COLOR.withAlpha(0.12 + model.heat * 0.12));
    targetHalo.show = true; secondaryHalo.show = true;
  }

  function updateUncertaintyPanel(snapshot) {
    const panel = document.getElementById("beaconUncertaintyPanel");
    if (!panel || !snapshot) return;
    const model = uncertaintyModel(snapshot);
    panel.innerHTML = `
      <div class="research-row"><span>Predictive std</span><span class="research-value">${formatPercent(model.std)}</span></div>
      <div class="research-row"><span>1σ visual proxy</span><span class="research-value">${formatNumber(model.sigmaKm, 1)} km</span></div>
      <div class="research-row"><span>95% visual envelope</span><span class="research-value">${formatNumber(model.envelopeKm, 1)} km</span></div>
      <div class="research-row"><span>Risk/uncertainty opacity</span><span class="research-value">${formatPercent(model.opacity)}</span></div>
      <div class="beacon-uncertainty-formula">σ_proxy = ${SIGMA_FLOOR_KM} km + ${SIGMA_PER_PROB_STD_KM} km × predictive_std + ${SIGMA_PER_DAY_KM} km/day × time_to_TCA<br>95% envelope = 1.96 × σ_proxy</div>
      <p class="research-muted">The source model exports probability uncertainty, not physical covariance. BEACON therefore visualizes an explicit comparative uncertainty proxy for human-AI triage review, not an operational covariance ellipsoid.</p>`;
  }

  function ensureExportUi() {
    const dock = document.getElementById("researchDock");
    if (!dock || runtime.exportUiReady) return;
    runtime.exportUiReady = true;

    const uncertaintyCard = document.createElement("div");
    uncertaintyCard.className = "card";
    uncertaintyCard.innerHTML = `<h3>Uncertainty Model</h3><div id="beaconUncertaintyPanel"></div>`;
    const exportCard = document.createElement("div");
    exportCard.className = "card";
    exportCard.id = "beaconExportCard";
    exportCard.innerHTML = `
      <h3>Screenshot / Export Mode</h3>
      <p class="research-muted">Export clean paper/demo figures or the current research snapshot.</p>
      <div class="beacon-export-row"><button id="beaconPngButton" type="button">Export PNG</button><button id="beaconJsonButton" type="button">Export JSON</button></div>
      <div class="beacon-export-row"><button id="beaconFigureModeButton" type="button">Figure mode</button><button id="beaconBriefButton" type="button">Research HTML</button></div>`;
    dock.appendChild(uncertaintyCard);
    dock.appendChild(exportCard);

    document.getElementById("beaconPngButton")?.addEventListener("click", exportPng);
    document.getElementById("beaconJsonButton")?.addEventListener("click", exportSnapshotJson);
    document.getElementById("beaconFigureModeButton")?.addEventListener("click", toggleFigureMode);
    document.getElementById("beaconBriefButton")?.addEventListener("click", exportResearchHtml);
  }

  function exportName(ext) {
    const event = currentEvent?.();
    const snapshot = state.displaySnapshot || currentSnapshot();
    const eventId = String(event?.event_id || "event").replace(/[^a-z0-9_-]+/gi, "-");
    const horizon = String(snapshot?.horizon || "snapshot").replace(/[^a-z0-9_-]+/gi, "-");
    return `beacon-${eventId}-${horizon}.${ext}`;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPng() {
    document.body.classList.add("beacon-exporting");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        viewer.render();
        viewer.scene.canvas.toBlob((blob) => {
          document.body.classList.remove("beacon-exporting");
          if (blob) downloadBlob(blob, exportName("png"));
        }, "image/png");
      } catch (error) {
        document.body.classList.remove("beacon-exporting");
        console.warn("PNG export failed", error);
        alert("PNG export failed in this browser context. Try running the local viewer from http://localhost and hard refresh.");
      }
    }));
  }

  function exportSnapshotJson() {
    const event = currentEvent();
    const snapshot = state.displaySnapshot || currentSnapshot();
    const model = uncertaintyModel(snapshot);
    const payload = {
      export_type: "beacon_research_snapshot",
      generated_at_utc: new Date().toISOString(),
      event_id: event.event_id,
      display_name: event.display_name,
      horizon: snapshot.horizon,
      classification_note: "Research-only classification. Not an operational maneuver recommendation.",
      uncertainty_visualization: {
        source: "probability-space predictive_std mapped to comparative visual uncertainty proxy",
        sigma_proxy_km: model.sigmaKm,
        envelope_95_proxy_km: model.envelopeKm,
        formula: `sigma_proxy_km = ${SIGMA_FLOOR_KM} + ${SIGMA_PER_PROB_STD_KM} * predictive_std + ${SIGMA_PER_DAY_KM} * time_to_tca_days`,
      },
      snapshot,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), exportName("json"));
  }

  function exportResearchHtml() {
    const event = currentEvent();
    const snapshot = state.displaySnapshot || currentSnapshot();
    const model = uncertaintyModel(snapshot);
    const html = `<!doctype html><meta charset="utf-8"><title>BEACON Research Brief</title><style>body{font-family:system-ui;margin:32px;line-height:1.45;max-width:900px}code{background:#eef;padding:2px 5px;border-radius:4px}</style><h1>BEACON Research Brief</h1><p><b>Event:</b> ${event.display_name || event.event_id}</p><p><b>Horizon:</b> ${snapshot.horizon}</p><p><b>Risk log10:</b> ${formatNumber(snapshot.current_risk_log10, 3)}</p><p><b>Model probability:</b> ${formatPercent(snapshot.model_probability)}</p><p><b>Predictive std:</b> ${formatPercent(snapshot.predictive_std)}</p><p><b>Relative distance:</b> ${formatNumber(snapshot.geometry.relative_distance_km, 3)} km</p><p><b>1σ visual proxy:</b> ${formatNumber(model.sigmaKm, 1)} km</p><p><b>95% visual envelope:</b> ${formatNumber(model.envelopeKm, 1)} km</p><p><code>σ_proxy = ${SIGMA_FLOOR_KM} km + ${SIGMA_PER_PROB_STD_KM} km × predictive_std + ${SIGMA_PER_DAY_KM} km/day × time_to_TCA</code></p><p><b>Use constraint:</b> Research-only classification. Not an operational maneuver recommendation.</p>`;
    downloadBlob(new Blob([html], { type: "text/html" }), exportName("html"));
  }

  function toggleFigureMode() {
    runtime.figureMode = !runtime.figureMode;
    document.body.classList.toggle("beacon-figure-mode", runtime.figureMode);
    const btn = document.getElementById("beaconFigureModeButton");
    if (btn) btn.textContent = runtime.figureMode ? "Exit figure mode" : "Figure mode";
  }

  function patchEventAndPlayback() {
    if (typeof setEvent === "function" && !setEvent.__beaconRuntimePatched) {
      setEvent = function runtimeSetEvent(index) {
        pausePlayHorizons();
        stopAnimation();
        state.eventIndex = Number(index);
        state.horizonIndex = 0;
        state.displaySnapshot = currentSnapshot();
        populateHorizonSelect();
        state.hovered = null;
        updateHoverLabels();
        renderScene(trackToggle.checked);
      };
      setEvent.__beaconRuntimePatched = true;
    }

    function playbackTick(shouldTrack) {
      const event = currentEvent();
      const next = (state.horizonIndex + 1) % event.snapshots.length;
      const before = trackToggle.checked;
      transitionToHorizon(next, { smooth: smoothToggle.checked });
      trackToggle.checked = shouldTrack ? before : false;
      if (!shouldTrack) viewer.trackedEntity = undefined;
    }

    function patchedTogglePlay() {
      if (state.playTimer) {
        pausePlayHorizons();
        return;
      }
      const shouldTrack = trackToggle.checked;
      playButton.textContent = "Pause";
      state.playTimer = setInterval(() => playbackTick(shouldTrack), smoothToggle.checked ? 1250 : 900);
    }

    if (typeof togglePlay === "function" && !togglePlay.__beaconRuntimePatched) {
      togglePlay = patchedTogglePlay;
      togglePlay.__beaconRuntimePatched = true;
    }

    if (!runtime.playInterceptReady && playButton) {
      runtime.playInterceptReady = true;
      playButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        patchedTogglePlay();
      }, true);
    }
  }

  function patchScrubber() {
    if (runtime.scrubReady) return;
    const scrubber = document.getElementById("researchScrubber");
    if (!scrubber) return;
    runtime.scrubReady = true;

    function start() {
      pausePlayHorizons();
      window.__BEACON_RESEARCH_SCRUBBING__ = true;
      resetCameraFramePreservingView();
    }
    function move() {
      pausePlayHorizons();
      requestAnimationFrame(resetCameraFramePreservingView);
    }
    function end() {
      pausePlayHorizons();
      requestAnimationFrame(() => {
        resetCameraFramePreservingView();
        window.__BEACON_RESEARCH_SCRUBBING__ = false;
      });
    }

    scrubber.addEventListener("pointerdown", start, true);
    scrubber.addEventListener("input", move, true);
    scrubber.addEventListener("change", move, true);
    scrubber.addEventListener("pointerup", end, true);
    scrubber.addEventListener("pointercancel", end, true);
  }

  function patchRenderSnapshot() {
    if (runtime.renderPatched || typeof renderSnapshot !== "function") return;
    runtime.renderPatched = true;
    const previousRenderSnapshot = renderSnapshot;
    renderSnapshot = function runtimeRenderSnapshot(snapshot, track = false) {
      previousRenderSnapshot(snapshot, track);
      redrawMapOverlay();
      styleLabels();
      syncScientificUncertainty(snapshot);
      updateUncertaintyPanel(snapshot);
      if (track && trackToggle.checked) keepRotationPivotOnSnapshot(snapshot);
    };
  }

  function frame() {
    injectRuntimeCss();
    ensurePanelScrollbar();
    updatePanelScrollbar();
    ensureMapWrapper();
    patchEventAndPlayback();
    patchScrubber();
    patchRenderSnapshot();
    ensureExportUi();
    redrawMapOverlay();
    styleLabels();
    if (state.displaySnapshot) {
      syncScientificUncertainty(state.displaySnapshot);
      updateUncertaintyPanel(state.displaySnapshot);
      if (trackToggle?.checked) keepRotationPivotOnSnapshot(state.displaySnapshot);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_RESEARCH_RUNTIME__ = true;
})();
