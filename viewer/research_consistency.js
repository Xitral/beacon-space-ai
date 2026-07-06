// Research-consistency safeguards for BEACON viewer.
// This module keeps the UI honest about data provenance, visual scaling, and
// uncertainty semantics while avoiding duplicated export controls.
(function beaconResearchConsistency() {
  let stylesReady = false;
  let cardReady = false;
  let watermarkReady = false;

  function injectStyles() {
    if (stylesReady) return;
    stylesReady = true;
    const style = document.createElement("style");
    style.id = "beaconResearchConsistencyStyles";
    style.textContent = `
      #beaconValidityCard .status-pill{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-left:6px;background:rgba(255,255,255,.06)}
      #beaconValidityCard .status-pill.warn{color:#ffd166;border-color:rgba(255,209,102,.34);background:rgba(255,209,102,.10)}
      #beaconValidityCard .status-pill.ok{color:#9ee493;border-color:rgba(158,228,147,.34);background:rgba(158,228,147,.10)}
      #beaconValidityCard ul{padding-left:17px;margin:8px 0 0}#beaconValidityCard li{margin:5px 0}
      #beaconResearchWatermark{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:80;pointer-events:none;padding:7px 11px;border:1px solid rgba(126,177,255,.18);border-radius:999px;background:rgba(5,10,20,.46);color:rgba(238,246,255,.82);font:700 11px Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;backdrop-filter:blur(10px);box-shadow:0 12px 34px rgba(0,0,0,.24)}
      body.beacon-exporting #beaconResearchWatermark{display:block!important;background:rgba(5,10,20,.30)}
    `;
    document.head.appendChild(style);
  }

  function currentDataMode() {
    const metadata = state.data?.metadata || {};
    const event = currentEvent?.();
    const snapshot = state.displaySnapshot || currentSnapshot?.();
    const generated = Boolean(metadata.generated_at_utc);
    const isSample = !generated || event?.event_id === "sample" || metadata.coordinate_note?.toLowerCase?.().includes("sample data");
    const geometryMode = snapshot?.geometry?.mode || metadata.geometry_modes?.join(", ") || "unknown";
    return { metadata, event, snapshot, generated, isSample, geometryMode };
  }

  function removeLegacyBriefCard() {
    const oldButton = document.getElementById("briefButton");
    if (!oldButton) return;
    const card = oldButton.closest(".card");
    if (card) card.remove();
  }

  function relabelFeatureBadges() {
    for (const badge of document.querySelectorAll(".research-feature")) {
      const text = badge.textContent.trim();
      if (text === "Uncertainty volumes") badge.textContent = "Uncertainty proxy";
      if (text === "TCA volume") badge.textContent = "TCA proxy volume";
    }
  }

  function ensureValidityCard() {
    const dock = document.getElementById("researchDock");
    if (!dock || cardReady) return;
    cardReady = true;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "beaconValidityCard";
    card.innerHTML = `<h3>Research Validity Guardrails <span id="beaconDataStatus" class="status-pill">checking</span></h3><div id="beaconValidityBody"></div>`;
    const firstCard = dock.querySelector(".card");
    if (firstCard) dock.insertBefore(card, firstCard.nextSibling);
    else dock.appendChild(card);
  }

  function updateValidityCard() {
    const body = document.getElementById("beaconValidityBody");
    const status = document.getElementById("beaconDataStatus");
    if (!body || !status) return;

    const { metadata, snapshot, generated, isSample, geometryMode } = currentDataMode();
    const scale = Number(snapshot?.geometry?.display_relative_scale ?? 1);
    const originalDistance = snapshot?.geometry?.relative_distance_km;
    const shownDistance = snapshot?.geometry?.display_relative_distance_km;
    const modes = Array.isArray(metadata.geometry_modes) ? metadata.geometry_modes.join(", ") : geometryMode;

    status.className = `status-pill ${isSample ? "warn" : "ok"}`;
    status.textContent = isSample ? "sample/fallback" : "exported data";

    body.innerHTML = `
      <div class="research-row"><span>Data source</span><span class="research-value">${generated ? "exported JSON" : "sample fallback"}</span></div>
      <div class="research-row"><span>Geometry mode</span><span class="research-value">${String(geometryMode).replaceAll("_", " ")}</span></div>
      <div class="research-row"><span>Available modes</span><span class="research-value">${String(modes).replaceAll("_", " ")}</span></div>
      <div class="research-row"><span>Display scale</span><span class="research-value">${Number.isFinite(scale) ? scale.toFixed(1) + "×" : "—"}</span></div>
      <ul>
        <li>Uncertainty shapes are probability-space visual proxies, not orbital covariance ellipsoids.</li>
        <li>Original separation is ${Number.isFinite(Number(originalDistance)) ? Number(originalDistance).toFixed(3) + " km" : "preserved in data"}; displayed separation is ${Number.isFinite(Number(shownDistance)) ? Number(shownDistance).toFixed(3) + " km" : "scaled only when needed"}.</li>
        <li>Viewer geometry is for interpretability and communication only, not operational propagation.</li>
      </ul>`;
  }

  function ensureWatermark() {
    if (watermarkReady) return;
    watermarkReady = true;
    const watermark = document.createElement("div");
    watermark.id = "beaconResearchWatermark";
    document.body.appendChild(watermark);
  }

  function updateWatermark() {
    const watermark = document.getElementById("beaconResearchWatermark");
    if (!watermark) return;
    const { isSample, geometryMode } = currentDataMode();
    watermark.textContent = `${isSample ? "Sample/fallback data" : "Research-only viewer"} • ${String(geometryMode).replaceAll("_", " ")} • Not operational`;
  }

  function frame() {
    injectStyles();
    removeLegacyBriefCard();
    relabelFeatureBadges();
    ensureValidityCard();
    updateValidityCard();
    ensureWatermark();
    updateWatermark();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__BEACON_RESEARCH_CONSISTENCY__ = true;
})();
