import { creativeMapLayout, creativeLandscapeLayout } from "./map-layout.mjs";
import { demoData } from "./demo.mjs";
import { ageDays, families, summarize, title } from "./core.mjs";
import { researchFindings, patternExamples, copyBreakdown } from "./findings.mjs";
import { replayDuration, replayFrame, revealedLabels, visualFrame, CLOSEUP_SECONDS } from "./replay.mjs";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const fmt = (n) => Number(n).toLocaleString("en-US"),
  demo = demoData();
let hasImageLibrary = false;
let selectedId = null;
let wallOffset = 0;
let exampleDimension = "format", exampleKey = null, exampleOffset = 0, exampleAdId = null, exampleSignature = "", exampleTotal = 0;
let jumpToExamples = location.hash === "#pattern-examples";
let replay = null;
let serverBusy = false;
const wallCards = new Map();
const mapPoints = new Map(), mapNodes = new Map();
let mapClusters = new Map(), mapClusterKey = null, mapClusterOffset = 0, mapGallerySignature = "", mapWidth = 560;
const scanImages = new Map();
const scanEffects = new Set();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let scanSession = false, scanAdId = null, scanRows = [], scanPhase = 0, scanReveal = -1;
let mode = "demo",
  elapsed = 0,
  playing = false,
  last = 0,
  count = 0,
  filter = null,
  real = { ads: [], briefs: [], events: [] },
  shown = [],
  polling = false,
  toastTimer;
const params = new URLSearchParams(location.search);
if (params.get("portrait") === "1") document.body.classList.add("portrait");
if (params.get("clean") === "1") document.body.classList.add("clean");
if (["20", "40", "80"].includes(params.get("duration")))
  $("#duration").value = params.get("duration");
if (["close", "timelapse"].includes(params.get("scan"))) $("#scanStyle").value = params.get("scan");
const pos = (tile) =>
  `${((tile % 4) / 3) * 100}% ${(Math.floor(tile / 4) / 3) * 100}%`;
const preview = (ad) => {
  const frame = ad.visualFrames?.find(f => f.time > 0)?.url || ad.visualFrames?.[0]?.url;
  if (frame) return frame;
  if (ad.imageUrl?.startsWith("/uploads/") || ad.imageUrl?.startsWith("/demo-images/")) return ad.imageUrl;
  return ad.imageUrl ? "/api/media?url=" + encodeURIComponent(ad.imageUrl) : null;
};
function art(ad, cls = "art") {
  if (Number.isInteger(ad.tile))
    return `<div class="${cls}" style="background-position:${pos(ad.tile)}"></div>`;
  const url = preview(ad);
  return url
    ? `<img class="actual-art" loading="lazy" src="${esc(url)}" alt="${esc(ad.brand)} creative">`
    : `<div class="fallback">${esc((ad.text || ad.ocr || ad.transcript || "Awaiting creative evidence").slice(0, 130))}</div>`;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 6000);
}
async function api(path, data) {
  const r = await fetch(
    "/api/" + path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}
async function action(fn) {
  try {
    setPlaying(false);
    replay = null;
    scanSession = false;
    clearScanEffects();
    await fn();
    await refresh();
  } catch (e) {
    toast(e.message);
  }
}
function label(ad, key) {
  return ad.labels?.[key]?.value || "unknown";
}
function replayAds() {
  return mode === "demo" ? demo.ads : replay?.ads || real.ads.filter(a => a.status === "complete");
}
function playbackDuration() {
  return replayDuration(replayLength(), $("#scanStyle").value, $("#duration").value);
}
function clearScanEffects() {
  for (const effect of scanEffects) { effect.animation.cancel(); effect.element.remove(); }
  scanEffects.clear();
}
function trackScanEffect(element, animation) {
  const effect = { element, animation };
  scanEffects.add(effect);
  if (!playing) animation.pause();
  animation.finished.then(() => { element.remove(); scanEffects.delete(effect); }, () => {});
}
function preloadScanImages(ads, index) {
  for (const ad of ads.slice(index, index + 12)) {
    const urls = $("#scanStyle").value === "close" && ad.visualFrames?.length
      ? ad.visualFrames.map(f => f.url).filter(Boolean) : [preview(ad)].filter(Boolean);
    for (const url of urls) if (!scanImages.has(url)) {
      const img = new Image();
      img.src = url;
      scanImages.set(url, img);
    }
  }
  while (scanImages.size > 128) scanImages.delete(scanImages.keys().next().value);
}
function renderScan(phase = scanPhase) {
  const stage = $("#analysisStage"), ads = replayAds();
  stage.hidden = !scanSession || !ads.length;
  if (stage.hidden) return;
  const index = Math.min(count, ads.length - 1), ad = ads[index];
  const done = count === ads.length;
  if (done) phase = 1;
  scanPhase = phase;
  if (scanAdId !== ad.id) {
    scanAdId = ad.id;
    scanReveal = -1;
    scanRows = Object.entries(ad.labels || {});
    stage.dataset.ad = ad.id;
    $("#scanBrand").textContent = ad.brand;
    $("#scanCopy").textContent = (ad.text || ad.transcript || ad.ocr || "No copy supplied.").slice(0, 160);
    $("#scanLabels").innerHTML = scanRows.map(([key]) => `<div class="scan-label" data-ready="false"><span>${esc(title(key === "cta" ? "CTA" : key))}</span><strong>Reading…</strong><small></small><i><b></b></i></div>`).join("");
    preloadScanImages(ads, index);
  }
  $("#scanOrdinal").textContent = `${fmt(index + 1)} / ${fmt(ads.length)}`;
  $("#scanState").textContent = done ? "RUN REPLAYED" : phase < .28 ? "READING VISUALS" : phase < .86 ? "REVEALING LABELS" : "READY TO PLOT";
  const frames = ad.visualFrames || [];
  const frameIndex = $("#scanStyle").value === "close" ? visualFrame(phase, frames.length) : 0;
  const url = frames[frameIndex]?.url || preview(ad), image = $("#scanImage");
  image.hidden = !url;
  if (url && image.getAttribute("src") !== url) image.src = url;
  image.alt = `${ad.brand}, saved visual evidence ${frameIndex + 1}`;
  const fallback = $("#scanFallback");
  fallback.hidden = Boolean(url);
  if (!url) {
    fallback.className = Number.isInteger(ad.tile) ? "art" : "fallback";
    fallback.style.backgroundPosition = Number.isInteger(ad.tile) ? pos(ad.tile) : "";
    fallback.textContent = Number.isInteger(ad.tile) ? "" : (ad.text || "No image evidence").slice(0, 100);
  }
  $("#scanFrameLabel").textContent = frames.length > 1 ? `FRAME ${frameIndex + 1} / ${frames.length}` : ad.kind === "video" ? "VIDEO THUMBNAIL" : "IMAGE CREATIVE";
  const revealed = done ? scanRows.length : revealedLabels(phase, scanRows.length);
  const rows = $("#scanLabels").children;
  if (revealed !== scanReveal) scanRows.forEach(([key, result], i) => {
    const ready = i < revealed, row = rows[i];
    row.dataset.ready = String(ready);
    row.querySelector("strong").textContent = ready ? title(result.value) : "Reading…";
    const confidence = Number(result.confidence);
    row.querySelector("small").textContent = ready && Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "";
    row.querySelector("b").style.transform = `scaleX(${ready && Number.isFinite(confidence) ? confidence : 0})`;
  });
  scanReveal = revealed;
  // Update only transforms on the frame clock; labels change at stage boundaries.
  $("#scanBeam").style.transform = `translateY(${Math.min(1, phase / .86) * 210}px)`;
  $("#scanBeam").style.opacity = done || phase > .92 || reducedMotion.matches ? "0" : "1";
  $("#scanReady").style.opacity = phase >= .86 ? "1" : "0";
  $("#scanVisualStep").className = phase < .28 ? "active" : "done";
  $("#scanLabelStep").className = phase >= .28 && phase < .86 ? "active" : phase >= .86 ? "done" : "";
  $("#scanPlotStep").className = phase >= .86 ? "active" : "";
  const current = wallCards.get(ad.id);
  if (current?.isConnected) {
    current.classList.add("scanning");
    current.querySelector(".tile-scan").style.transform = `translateY(${phase * 100}%)`;
  }
}
function animateClassified(from, to) {
  if (reducedMotion.matches || document.hidden || !scanSession) return;
  const ads = replayAds(), map = $("#map"), mapRect = map.getBoundingClientRect();
  for (const ad of ads.slice(from, to)) {
    const point = mapPoints.get(ad.family || ad.id);
    if (!point) continue;
    const targetX = mapRect.left + Number(point.dataset.x) / 560 * mapRect.width;
    const targetY = mapRect.top + Number(point.dataset.y) / 350 * mapRect.height;
    const targetScale = Number(point.querySelector('.map-thumbnail').getAttribute('width')) / 26 * mapRect.width / 560;
    const tile = wallCards.get(ad.id);
    const origin = (tile?.isConnected ? tile : $(".scan-media")).getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "scan-flight";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.left = `${origin.left + origin.width / 2 - 13}px`;
    ghost.style.top = `${origin.top + origin.height / 2 - 18}px`;
    ghost.innerHTML = art(ad);
    document.body.append(ghost);
    const dx = targetX - origin.left - origin.width / 2, dy = targetY - origin.top - origin.height / 2;
    trackScanEffect(ghost, ghost.animate([
      { transform: "translate(0,0) scale(1)", opacity: .9 },
      { transform: `translate(${dx * .4}px,${Math.min(dy * .4, -45)}px) scale(.8)`, opacity: .9, offset: .45 },
      { transform: `translate(${dx}px,${dy}px) scale(${targetScale})`, opacity: 0 },
    ], { duration: 430, easing: "cubic-bezier(.22,.61,.36,1)" }));
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", point.dataset.x);
    ring.setAttribute("cy", point.dataset.y);
    ring.setAttribute("r", "8");
    ring.setAttribute("class", "map-arrival");
    map.append(ring);
    trackScanEffect(ring, ring.animate([{ opacity: 0 }, { opacity: .8, offset: .5 }, { opacity: 0 }], { duration: 650 }));
  }
}
function toolbarSelected(ads) {
  return ads.filter(a => (!$("#formatFilter").value || label(a, "format") === $("#formatFilter").value) && (!$("#hookFilter").value || label(a, "hook") === $("#hookFilter").value));
}
function selected(ads) {
  return toolbarSelected(ads).filter(a => !filter || label(a, $("#dimension").value) === filter);
}
function selectCreative(id) {
  selectedId = id;
  render();
}
function renderInspector(ads) {
  const subset = selected(ads);
  const a = subset.find(a => a.id === selectedId) || (playing ? subset.at(-1) : subset.find(a => label(a, "format") === "comparison" && ageDays(a) >= 60) || subset[0]);
  if (!a) {
    selectedId = null;
    $("#inspector").innerHTML = '<p class="empty">No creatives match these filters. Try another format or hook.</p>';
    return;
  }
  selectedId = a.id;
  const variants = ads.filter(row => row.family === a.family).length;
  const labels = Object.entries(a.labels || {});
  const sourceLabel = mode === "demo" ? "Open image source" : "Original ad";
  $("#inspector").innerHTML = `<div class="preview-row"><div class="preview-media">${art(a)}</div><div class="preview-caption"><strong>${esc(a.brand)}</strong><p>${mode === "demo" ? "DEMO EXAMPLE" : "COLLECTED CREATIVE"}<br>${esc(a.collectedAt?.slice(0, 10) || "Date unknown")}</p><div class="tags"><span class="tag">${esc(title(label(a, "format")))}</span><span class="tag">${esc(title(label(a, "hook")))}</span></div>${a.url ? `<p style="margin-top:10px"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${sourceLabel} ↗</a></p>` : ""}</div></div><div><p class="sample-copy-label">${mode === "demo" ? "SAMPLE COPY / FICTIONAL HAIRCARE BRIEF" : "AD COPY"}</p><blockquote class="opening">${esc(a.text || a.transcript || "No copy supplied.")}</blockquote></div><div class="post-metrics"><div><strong>${ageDays(a) ?? "?"}d</strong><span>${mode === "demo" ? "Sample age" : "Age since start"}</span></div><div><strong>${variants}</strong><span>${mode === "demo" ? "Sample group IDs" : "Group ad IDs"}</span></div><div><strong>${labels.length}</strong><span>${mode === "demo" ? "Sample labels" : "Typed labels"}</span></div></div><div><p class="anatomy-heading">${mode === "demo" ? "HOW TO TEST THIS FORMAT" : "CLASSIFICATION BREAKDOWN"}</p>${mode === "demo" ? (a.sampleBeats || []).map((beat, i) => `<div class="anatomy-step"><small>0${i + 1} / ${["OPENING", "DEMONSTRATION", "NEXT STEP"][i]}</small><p>${esc(beat)}</p></div>`).join("") : labels.map(([key, v]) => `<div class="anatomy-step"><small>${esc(title(key))}</small><p>${esc(title(v.value))} · ${Math.round(v.confidence * 100)}% confidence</p></div>`).join("")}<p class="inspector-note">${mode === "demo" ? "Public inspiration image. This copy, grouping, age and labels are simulated, not observations about the pictured campaign." : "Labels describe supplied evidence. Open the detail view to inspect submitted frames and available words."}</p><button class="inspect-button" data-detail="${esc(a.id)}">All labels & evidence ↗</button></div>`;
}
function evidenceText(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function renderAdBreakdown(ad) {
  const panel = $("#exampleDetail");
  if (!ad) { panel.innerHTML = '<p class="empty">Select a pattern with saved examples to inspect an ad.</p>'; panel.removeAttribute('data-selected-ad'); return; }
  panel.dataset.selectedAd = ad.id;
  const parts = copyBreakdown(ad), labels = Object.entries(ad.labels || {});
  const frames = ad.visualFrames || [];
  panel.innerHTML = `<p class="eyebrow">INSIDE THIS AD</p><div class="example-detail-top"><div class="example-detail-art">${art(ad)}</div><div><h3>${esc(title(label(ad, 'format')))} ad</h3><p>${esc(ad.brand)} · ${ageDays(ad) ?? '?'} days old at collection</p><div class="tags"><span>${esc(title(label(ad, 'hook')))}</span><span>${esc(title(label(ad, 'offer')))}</span></div>${ad.url ? `<a href="${esc(ad.url)}" target="_blank" rel="noopener noreferrer">Original ad ↗</a>` : ''}</div></div>
    <details class="example-labels"><summary>${labels.length} saved classifications</summary><dl class="ad-classifications">${labels.map(([key, result]) => `<div><dt>${esc(title(key))}</dt><dd>${esc(title(result.value))}<small>${Number.isFinite(result.confidence) ? Math.round(result.confidence * 100) + '%' : '?'}</small></dd></div>`).join('')}</dl></details>
    <div class="copy-section-heading"><h4>${esc(parts.source)}</h4><span>${parts.sections.length} text sections</span></div>
    <div class="ad-copy-sections">${parts.sections.map(section => `<section data-copy-role="${esc(section.role)}"><h5>${esc(section.role)}</h5><p>${evidenceText(section.text)}</p></section>`).join('') || '<p class="empty">No ad text was saved. Inspect the visual frames or open the original.</p>'}</div>
    <p class="example-source-note">${mode === 'demo' ? 'Sample copy and simulated classifications.' : parts.source === 'Speech transcript' ? 'Saved speech transcript. Sections follow text boundaries.' : 'These are the saved ad words, split at text boundaries. A speech transcript was not saved for this ad.'}</p>
    ${frames.length ? `<h4>Visual evidence</h4><div class="example-frames">${frames.map((frame, i) => `<figure><img loading="lazy" src="${esc(frame.url)}" alt="Saved visual evidence ${i + 1}"><figcaption>${Number.isFinite(frame.time) ? frame.time.toFixed(1) + 's' : 'Static image'}</figcaption></figure>`).join('')}</div>` : ''}
    <button class="inspect-button" data-detail="${esc(ad.id)}">All source evidence & model details ↗</button>`;
  panel.scrollTop = 0;
}
function renderExampleBrowser(ads, findings) {
  const select = $("#examplePattern"), summary = summarize(ads, exampleDimension);
  const options = '<option value="">All ' + exampleDimension + 's</option>' + summary.map(row => `<option value="${esc(row.key)}">${esc(title(row.key))} (${fmt(row.n)})</option>`).join('');
  if (select.dataset.options !== options) { select.innerHTML = options; select.dataset.options = options; }
  const automatic = findings.find(f => f.dimension === exampleDimension)?.key || summary[0]?.key || '';
  const key = exampleKey === null ? automatic : exampleKey;
  select.value = key;
  $("#exampleDimension").value = exampleDimension;
  const all = patternExamples(toolbarSelected(ads), exampleDimension, key, {sort: $("#exampleSort").value});
  const older = all.filter(a => a.active === true && ageDays(a) !== null && ageDays(a) >= 60);
  const rows = $("#exampleOlder").checked ? older : all;
  exampleTotal = rows.length;
  exampleOffset = Math.min(exampleOffset, Math.max(0, Math.floor((rows.length - 1) / 12) * 12));
  const requested = rows.findIndex(a => a.id === exampleAdId);
  if (requested >= 0 && (requested < exampleOffset || requested >= exampleOffset + 12)) exampleOffset = Math.floor(requested / 12) * 12;
  const page = rows.slice(exampleOffset, exampleOffset + 12);
  if (!page.some(a => a.id === exampleAdId)) exampleAdId = page[0]?.id || null;
  $("#exampleScopeTitle").textContent = `${key ? title(key) : 'All'} ads`;
  $("#exampleScopeCount").textContent = `${fmt(rows.length)} ads · ${fmt(new Set(rows.map(a => a.family || a.id)).size)} creative families`;
  $("#exampleOlderCount").textContent = `(${fmt(older.length)})`;
  $("#examplePrevious").disabled = exampleOffset === 0;
  $("#exampleNext").disabled = exampleOffset + 12 >= rows.length;
  $("#examplePage").textContent = rows.length ? `${fmt(exampleOffset + 1)} to ${fmt(Math.min(rows.length, exampleOffset + 12))} of ${fmt(rows.length)}` : '0 examples';
  const signature = `${mode}|${exampleDimension}|${key}|${exampleAdId}|${JSON.stringify(page.map(a => [a.id,a.labels,a.text,a.transcript]))}`;
  if (signature === exampleSignature) return;
  exampleSignature = signature;
  $("#exampleGrid").innerHTML = page.map(ad => {
    const text = copyBreakdown(ad).sections[0]?.text || ad.headline || 'Open visual evidence';
    const opening = text.replace(/\*\*/g, '').replace(/\s+/g, ' ');
    return `<button class="example-card ${exampleAdId === ad.id ? 'is-selected' : ''}" data-example-ad="${esc(ad.id)}" aria-pressed="${exampleAdId === ad.id}" aria-label="Inspect ${esc(title(label(ad,'format')))} ad ${esc(ad.id)}"><div class="example-art">${art(ad)}<span class="example-age">${ageDays(ad) ?? '?'}d</span></div><div class="example-card-copy"><small>${esc(title(label(ad,'hook')))} · ${esc(title(label(ad,'offer')))}</small><strong>${esc(opening.slice(0, 180))}</strong><span>Read the breakdown ↗</span></div></button>`;
  }).join('') || '<p class="empty">No ads match this group and age filter. Turn off 60+ days only or choose another group.</p>';
  renderAdBreakdown(page.find(a => a.id === exampleAdId));
}
function renderFindings(ads) {
  const findings = researchFindings(ads);
  $("#findingsNote").textContent = mode === "demo" ? "ILLUSTRATIVE REPORT / DEMO DATA" : "FOLLOW THE EVIDENCE";
  $("#findings").innerHTML = findings.map((f, i) => `<article class="finding"><p class="eyebrow">0${i + 1} / ${esc(f.dimension)} PATTERN</p><h3>${esc(f.heading)}</h3><div class="finding-stat"><strong>${Math.round(f.share * 100)}%</strong><span>active 60+ day share<br>${f.lift?.toFixed(1) || "?"}× the sample average</span></div><p>${esc(f.observation)}</p>${f.comparison ? `<p class="finding-comparison">Compared with <strong>${Math.round(f.comparison.share * 100)}%</strong> for ${esc(title(f.comparison.key).toLowerCase())} (${f.comparison.old} / ${f.comparison.dated}).</p>` : ''}
    ${f.facets.length ? `<div class="finding-facets"><small>Inside its ${f.old} older ads</small>${f.facets.map(facet => `<div><strong>${facet.n} / ${facet.total}</strong><span>${esc(title(facet.dimension))}: ${esc(title(facet.key))}</span></div>`).join('')}</div>` : ''}
    <div class="finding-previews">${f.exampleIds.map(id => { const ad=ads.find(a=>a.id===id); return `<button data-finding="${esc(f.key)}" data-dimension="${esc(f.dimension)}" data-preview="${esc(id)}" aria-label="Inspect ${esc(title(f.key))} example ${esc(id)}">${art(ad)}<span>${ageDays(ad) ?? '?'}d</span></button>`; }).join('')}</div>
    <p class="test-note"><strong>Your next test.</strong> ${esc(f.nextTest)}</p><button data-finding="${esc(f.key)}" data-dimension="${esc(f.dimension)}">Explore all ${fmt(f.n)} examples ↗</button></article>`).join("") || '<p class="empty">Findings appear once at least five dated active ads share a pattern.</p>';
  const minimum = findings[0]?.minimumGroupSize;
  $("#findingsMethod").textContent = `${minimum ? `Ranked among groups with at least ${minimum} dated active ads. ` : ''}60+ day share describes age in this snapshot, not continuous runtime, profitability or campaign results.`;
  renderExampleBrowser(ads, findings);
  if (jumpToExamples && ads.length) { jumpToExamples = false; requestAnimationFrame(() => $("#pattern-examples").scrollIntoView({block:'start'})); }
}
function explorePattern(dimension, key, id = null, scroll = true) {
  setPlaying(false);
  exampleDimension = dimension; exampleKey = key; exampleOffset = 0; exampleAdId = id; exampleSignature = '';
  $("#exampleOlder").checked = false;
  $("#formatFilter").value = ''; $("#hookFilter").value = '';
  $("#dimension").value = dimension; filter = key || null; selectedId = id; wallOffset = 0;
  render();
  if (scroll) $("#pattern-examples").scrollIntoView({behavior:reducedMotion.matches ? 'instant' : 'smooth',block:'start'});
}
function showDetail(id) {
  const a = (mode === "demo" ? demo.ads : real.ads).find((a) => a.id === id);
  if (!a) return;
  const age = ageDays(a);
  $("#detailBody").innerHTML =
    `${art(a, "detail-art")}<p class="eyebrow">${esc(a.source)} · ${esc(a.id)}</p><h2>${esc(a.brand)}</h2><p>${esc(a.headline || "Creative evidence")}</p><p>${age === null ? "Start date unknown" : age + " days since reported start"} · ${a.active === true ? "Active at collection" : a.active === false ? "Inactive at collection" : "Active status unknown"}</p><p>${esc(a.text || "No ad copy supplied.")}</p>${a.error ? `<p class="error">${esc(a.error)}</p>` : ""}<div style="clear:both"></div><h3>${mode === "demo" ? "Simulated labels, not a provider result" : "Typed labels"}</h3><ul>${
      Object.entries(a.labels || {})
        .map(
          ([k, v]) =>
            `<li>${esc(title(k))}: <b>${esc(title(v.value))}</b> · confidence ${Math.round(v.confidence * 100)}%</li>`,
        )
        .join("") || "<li>Not classified yet</li>"
    }</ul>${mode !== "demo" ? `<p>${esc(a.analysisProvider || "Jev")} · ${esc(a.model || "model unknown")} · ${a.visualSamples || 0} visual samples</p><div class="evidence-frames">${(a.visualFrames || []).map(f => `<figure><img src="${esc(f.url)}" alt="Saved creative evidence"><figcaption>${f.time == null ? "Static image" : f.time.toFixed(1) + "s"}</figcaption></figure>`).join("")}</div>` : ""}<details><summary>Saved text and transcript evidence</summary><p>${esc(a.ocr ? "Imported text: " + a.ocr : "No additional imported text.")}</p><p>${esc(a.transcript || "No speech transcript.")}</p><p>${esc(a.visualNotes || "No visual observations supplied.")}</p>${a.warning ? `<p>${esc(a.warning)}</p>` : ""}</details>${a.url ? `<p><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open source example ↗</a></p>` : "<p>No original campaign link was supplied.</p>"}`;
  $("#detail").showModal();
}
function renderWall(ads, total) {
  const visibleIDs = new Set(ads.map((a) => a.id));
  const subset = selected(ads),
    all = selected(total);
  const scanning = scanSession && count < replayLength();
  const completedSlots = scanning ? 48 : 72;
  const head = playing ? Math.max(0, subset.length - completedSlots) : wallOffset % Math.max(1, subset.length),
    recent = subset.slice(head, head + completedSlots);
  const pending = all
    .filter((a) => !visibleIDs.has(a.id))
    .slice(0, Math.max(0, 72 - recent.length));
  const cards = [...recent, ...pending].slice(-72);
  const fragment = document.createDocumentFragment();
  for (const a of cards) {
    let card = wallCards.get(a.id);
    const image = preview(a) || String(a.tile ?? "");
    if (!card || card.dataset.image !== image) {
      card = document.createElement("button");
      card.dataset.ad = a.id;
      card.dataset.image = image;
      card.setAttribute("aria-label", `Inspect ${a.brand} creative`);
      card.innerHTML = `${art(a)}<span class="tile-brand">${esc(a.brand)}</span><span class="tile-tag"></span><span class="tile-scan" aria-hidden="true"></span><span class="tile-check" aria-hidden="true">✓</span>`;
      wallCards.set(a.id, card);
    }
    card.className = `creative ${visibleIDs.has(a.id) ? "analyzed" : "pending"} ${a.id === selectedId ? "selected" : ""} ${scanning && a.id === replayAds()[count]?.id ? "scanning" : ""}`;
    card.querySelector(".tile-tag").textContent = `${visibleIDs.has(a.id) ? title(label(a, $("#dimension").value)) : "Queued"} · ${ageDays(a) ?? "?"}d`;
    fragment.append(card);
  }
  $("#wall").replaceChildren(fragment);
  if (!cards.length) $("#wall").innerHTML = '<p class="empty">Import creative evidence to start.</p>';
  $("#currentLabel").textContent = subset.length
    ? `${fmt(subset.length)} matching · click a frame to inspect`
    : "Waiting for the first creative";
}
function renderMapSelection() {
  const cluster = mapClusters.get(mapClusterKey), panel = $("#mapSelection");
  panel.hidden = !cluster;
  if (!cluster) { mapClusterKey = null; mapGallerySignature = ""; return; }
  const members = cluster.members;
  mapClusterOffset = Math.min(mapClusterOffset, Math.floor((members.length - 1) / 12) * 12);
  const signature = `${$("#mapView").value}|${cluster.key}|${selectedId}|${mapClusterOffset}|${members.map(g => `${g.ad.id}:${g.age}:${g.n}`).join("|")}`;
  if (signature === mapGallerySignature) return;
  mapGallerySignature = signature;
  const ages = members.map(g => g.age).filter(Number.isFinite);
  const minAge = Math.min(...ages), maxAge = Math.max(...ages);
  const common = key => {
    const values = new Map();
    for (const g of members) { const value = label(g.ad, key); values.set(value, (values.get(value) || 0) + 1); }
    return title([...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  };
  $("#mapSelectionTitle").textContent = `${fmt(members.length)} creative ${members.length === 1 ? "family" : "families"}`;
  $("#mapSelectionRange").textContent = $("#mapView").value === "landscape"
    ? `Most common labels: ${common("format")} / ${common("hook")}`
    : ages.length ? `${minAge === maxAge ? minAge : minAge + " to " + maxAge} days since start · select a preview to inspect` : "Dates unavailable";
  $("#mapClusterList").innerHTML = members.slice(mapClusterOffset, mapClusterOffset + 12).map(g =>
    `<button class="map-creative ${g.ad.id === selectedId ? "is-selected" : ""}" data-ad="${esc(g.ad.id)}" aria-label="${esc(g.ad.brand)}, ${esc(title(label(g.ad, "format")))}, ${esc(title(label(g.ad, "hook")))}, ${g.age ?? "unknown"} days, ${g.n} ad ${g.n === 1 ? "ID" : "IDs"}" aria-pressed="${g.ad.id === selectedId}">${art(g.ad)}<span title="${esc(title(label(g.ad, "format")))}">${esc(title(label(g.ad, "format")))}<small>${esc(title(label(g.ad, "hook")))} · ${g.age ?? "?"}d</small></span></button>`).join("");
  $("#mapSelectionPage").textContent = `${fmt(mapClusterOffset + 1)} to ${fmt(Math.min(members.length, mapClusterOffset + 12))} of ${fmt(members.length)}`;
  $("#mapPrevious").disabled = mapClusterOffset === 0;
  $("#mapNext").disabled = mapClusterOffset + 12 >= members.length;
}
function renderMap(ads) {
  const selectedAd = ads.find(a => a.id === selectedId);
  const selectedFamily = selectedAd && (selectedAd.family || selectedAd.id);
  const groups = families(selected(ads)), dated = groups.filter(g => g.age !== null);
  const landscape = $("#mapView").value === "landscape";
  // Keep full-run axes and stack slots stable while completed ads arrive.
  const complete = replay ? families(selected(replay.ads)) : groups;
  const bounds = landscape ? complete : complete.filter(g => g.age !== null);
  const mapped = landscape ? groups : dated;
  const layout = landscape ? creativeLandscapeLayout(mapped, bounds, mapWidth) : creativeMapLayout(mapped, bounds, mapWidth);
  const { xmax, ymax, x, y, scale } = layout;
  let svg = landscape ? '<rect x="20" y="12" width="533" height="308" fill="#f2f3eb"/>' : `<rect x="${x(60)}" y="20" width="${545 - x(60)}" height="288" fill="#edf0e4"/><line x1="${x(60)}" y1="20" x2="${x(60)}" y2="308" stroke="#9aac80" stroke-dasharray="3 5"/><text x="${x(60) + 8}" y="15" style="fill:#697f50;font-size:${10 / scale}px">60 DAYS</text>`;
  for (let i = 0; !landscape && i <= 4; i++) {
    const yy = 308 - i / 4 * 284;
    svg += `<line x1="38" y1="${yy}" x2="545" y2="${yy}" stroke="#dcded2"/><text x="28" y="${yy + 3}" text-anchor="end" style="font-size:${10 / scale}px">${ymax * i / 4}</text><text x="${38 + i / 4 * 507}" y="335" text-anchor="middle" style="font-size:${10 / scale}px">${xmax * i / 4}d</text>`;
  }
  const map = $("#map");
  map.setAttribute('aria-label', landscape ? 'Creative landscape based on saved classification labels, not ad performance. Select a thumbnail stack to browse every family.' : 'Creative families grouped by nearby age and ad count. Select a thumbnail stack to browse its families.');
  $("#mapAxisTitle").textContent = landscape ? 'HOOK · FORMAT · ANGLE · OFFER' : 'OBSERVED AD IDS IN FAMILY ↑';
  $("#mapLegend").textContent = landscape ? 'Color = hook' : '● Active, 60+ days since start';
  $("#mapAxisLabel").textContent = landscape ? 'CREATIVE SIMILARITY' : 'AGE SINCE REPORTED START →';
  $("#mapHelp").textContent = landscape ? 'Position groups similar saved labels, not ad performance. Select a numbered stack to browse every creative.' : 'Nearby families share a thumbnail stack. Select one to see every creative. Lines show the preview’s exact position.';
  if (!map.firstElementChild) map.innerHTML = '<g class="map-grid"></g><g class="map-points"></g>';
  if (map.dataset.grid !== svg) { map.querySelector('.map-grid').innerHTML = svg; map.dataset.grid = svg; }
  const layer = map.querySelector('.map-points'), keys = new Set();
  mapClusters = new Map(layout.clusters.map(c => [c.key, c]));
  mapPoints.clear();
  for (const cluster of layout.clusters) {
    keys.add(cluster.key);
    const focused = cluster.members.some(g => (g.ad.family || g.ad.id) === selectedFamily);
    const g = focused ? cluster.members.find(g => (g.ad.family || g.ad.id) === selectedFamily) : cluster.members[0];
    let point = mapNodes.get(cluster.key);
    if (!point) {
      point = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      point.setAttribute('tabindex', '0'); point.setAttribute('role', 'button');
      point.innerHTML = '<title></title><line class="map-leader"/><rect class="map-hit" fill="transparent"/><svg class="map-thumbnail" viewBox="0 0 14 18" overflow="hidden"><image class="map-thumbnail-image"/></svg><rect class="map-thumbnail-frame" rx="1"/><g class="map-stack-badge"><rect/><text text-anchor="middle" dominant-baseline="central"/></g>';
      layer.append(point); mapNodes.set(cluster.key, point);
    }
    for (const member of cluster.members) mapPoints.set(member.ad.family || member.ad.id, point);
    point.dataset.ad = g.ad.id; point.dataset.mapCluster = cluster.key;
    const className = `map-point ${focused ? "selected" : ""}`;
    if (point.getAttribute('class') !== className) point.setAttribute('class', className);
    point.setAttribute('aria-expanded', String(mapClusterKey === cluster.key));
    const cx = cluster.x, cy = cluster.y, width = layout.thumbnailWidth, height = layout.thumbnailHeight;
    const sprite = Number.isInteger(g.ad.tile), source = sprite ? '/assets/demo-creatives.jpg' : preview(g.ad);
    const geometry = `${landscape}|${g.ad.id}|${cx}|${cy}|${width}|${height}|${source}|${cluster.members.length}|${g.age}|${g.n}`;
    if (point.dataset.geometry === geometry) continue;
    point.dataset.geometry = geometry; point.dataset.x = cx; point.dataset.y = cy;
    const minAge = Math.min(...cluster.members.map(m => m.age)), maxAge = Math.max(...cluster.members.map(m => m.age));
    const description = `${fmt(cluster.members.length)} creative ${cluster.members.length === 1 ? "family" : "families"}${landscape ? ` grouped by saved labels. Preview: ${title(label(g.ad, "format"))}, ${title(label(g.ad, "hook"))}` : `, ${minAge === maxAge ? minAge : minAge + " to " + maxAge} days`}. Open thumbnail stack.`;
    point.setAttribute('aria-label', description); point.querySelector('title').textContent = description;
    const thumbnail = point.querySelector('.map-thumbnail'), image = point.querySelector('image'), frame = point.querySelector('.map-thumbnail-frame');
    for (const node of [thumbnail, frame]) {
      node.setAttribute('x', cx - width / 2); node.setAttribute('y', cy - height / 2);
      node.setAttribute('width', width); node.setAttribute('height', height);
    }
    const hit = point.querySelector('.map-hit');
    hit.setAttribute('x', cx - 22 / scale); hit.setAttribute('y', cy - 25 / scale);
    hit.setAttribute('width', 44 / scale); hit.setAttribute('height', 50 / scale);
    const leader = point.querySelector('.map-leader');
    leader.style.display = landscape ? 'none' : '';
    if (!landscape) {
      leader.setAttribute('x1', x(g.age)); leader.setAttribute('y1', y(g.n));
      leader.setAttribute('x2', cx); leader.setAttribute('y2', cy);
    }
    if (source) image.setAttribute('href', source); else image.removeAttribute('href');
    image.setAttribute('x', sprite ? -(g.ad.tile % 4) * 14 : 0);
    image.setAttribute('y', sprite ? -Math.floor(g.ad.tile / 4) * 18 : 0);
    image.setAttribute('width', sprite ? 56 : 14); image.setAttribute('height', sprite ? 72 : 18);
    image.setAttribute('preserveAspectRatio', sprite ? 'none' : 'xMidYMid slice');
    frame.setAttribute('fill', source ? 'none' : '#e2e5d9');
    const hookColors = { frustration:'#b77950', curiosity:'#8878a7', direct:'#61879c', result:'#8e8155', contradiction:'#67866d', mistake:'#b57587', offer:'#877a65' };
    frame.setAttribute('stroke', landscape ? hookColors[label(g.ad, 'hook')] || '#6b7566' : minAge >= 60 ? '#476637' : '#6b7566');
    const badge = point.querySelector('.map-stack-badge'), badgeWidth = Math.max(17, String(cluster.members.length).length * 6 + 7) / scale;
    badge.style.display = cluster.members.length > 1 ? '' : 'none';
    const bx = cx + width / 2 - badgeWidth, by = cy + height / 2 - 14 / scale;
    badge.querySelector('rect').setAttribute('x', bx); badge.querySelector('rect').setAttribute('y', by);
    badge.querySelector('rect').setAttribute('width', badgeWidth); badge.querySelector('rect').setAttribute('height', 14 / scale);
    const number = badge.querySelector('text'); number.setAttribute('x', bx + badgeWidth / 2); number.setAttribute('y', by + 7 / scale);
    number.style.fontSize = `${10 / scale}px`; number.textContent = cluster.members.length;
  }
  for (const [key, node] of mapNodes) if (!keys.has(key)) { node.remove(); mapNodes.delete(key); }
  const focusPoint = mapPoints.get(selectedFamily);
  if (focusPoint && layer.lastElementChild !== focusPoint) layer.append(focusPoint);
  $("#familyCount").textContent = fmt(families(ads).length);
  $("#mapNote").textContent = mode === "demo" ? 'Grouped sample labels · simulated data' : `${fmt(mapped.length)} ${mapped.length === 1 ? "family" : "families"} · ${layout.clusters.length} thumbnail ${layout.clusters.length === 1 ? "stack" : "stacks"}${!landscape && groups.length - dated.length ? ` · ${groups.length - dated.length} undated` : ""}`;
  renderMapSelection();
  const rows = summarize(toolbarSelected(ads), $("#dimension").value);
  $("#patterns").innerHTML =
    rows
      .slice(0, 6)
      .map(
        (p) =>
          `<div class="pattern ${filter === p.key ? "selected" : ""}" role="button" tabindex="0" data-pattern="${esc(p.key)}" aria-pressed="${filter === p.key}"><div class="pattern-name">${esc(title(p.key))}<small>${fmt(p.n)} ads · ${p.families} families · ${p.brands} brands</small></div><div class="spark"><i style="width:${(p.share ?? 0) * 100}%"></i></div><div class="pattern-result">${p.share === null ? "—" : Math.round(p.share * 100) + "%"}<small>${p.old} / ${p.dated} dated active</small></div></div>`,
      )
      .join("") ||
    '<p class="empty">Patterns appear as classifications arrive.</p>';
}
let briefSignature = "";
function renderBriefs(briefs, ads) {
  const ids = new Set(selected(ads).map((a) => a.id));
  const eligible = briefs.filter((b) => b.sourceIds.some((id) => ids.has(id)));
  $("#briefCount").textContent = `${eligible.length} ${eligible.length === 1 ? "BRIEF" : "BRIEFS"}`;
  $(".brief-panel").hidden = eligible.length === 0;
  const sig = JSON.stringify(eligible);
  if (sig === briefSignature) return;
  briefSignature = sig;
  $("#briefFeed").innerHTML =
    [...eligible]
      .reverse()
      .map((b, i) => {
        const a = (mode === "demo" ? demo.ads : real.ads).find(
          (a) => a.id === b.sourceIds?.[0],
        );
        return `<article class="brief"><div class="brief-top"><span>BRIEF ${String(eligible.length - i).padStart(2, "0")} / ${esc(b.title)}</span><span>↗</span></div><h3>“${esc(b.hook)}”</h3><div class="brief-bottom"><div class="brief-source">${a ? `<button class="source-thumb" data-ad="${esc(a.id)}" aria-label="Inspect source creative" style="${Number.isInteger(a.tile) ? "background-position:" + pos(a.tile) : "background-image:none"}">${!Number.isInteger(a.tile) && preview(a) ? `<img src="${esc(preview(a))}" alt="Source creative" style="width:100%;height:100%;object-fit:cover">` : ""}</button>` : ""}<span>${esc(b.source)}<br>${b.sourceIds?.length || 0} source creative</span></div><div class="review">${
          Object.entries(b.review?.scores || {})
            .map(
              ([k, v]) =>
                `<div><span>${esc(title(k))}</span><i><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i><span>${Math.round(v)}</span></div>`,
            )
            .join("") || '<span class="hint">Review not run</span>'
        }</div></div><details><summary>Open shooting outline</summary><ul>${(b.beats || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details></article>`;
      })
      .join("") ||
    `<p class="empty">${ads.length ? "No briefs are linked to these filters. Reset filters to explore the other concepts." : "Briefs will arrive here. Each stays linked to its source creative."}</p>`;
}
function render() {
  const ads =
    mode === "demo"
      ? demo.ads.slice(0, count)
      : replay ? replay.ads.slice(0, count) : real.ads.filter((a) => a.status === "complete");
  shown = ads;
  const total = mode === "demo" ? demo.ads : replay ? replay.ads : real.ads;
  for (const key of ["format", "hook"]) {
    const select = $("#" + key + "Filter");
    const values = [...new Set(total.filter(a => a.status === "complete").map(a => label(a, key)))].sort();
    const signature = values.join("|");
    if (select.dataset.signature !== signature) {
      const value = select.value;
      select.innerHTML = `<option value="">All ${key === "format" ? "formats" : "hooks"}</option>` + values.map(v => `<option value="${esc(v)}">${esc(title(v))}</option>`).join("");
      select.value = values.includes(value) ? value : "";
      select.dataset.signature = signature;
    }
  }
  $("#adsCount").textContent = fmt(ads.length);
  $("#adsCountLabel").textContent = mode === "demo" ? "sample ads" : replay && count < replay.ads.length ? "ads replayed" : "ads classified";
  $("#decisionsLabel").textContent = mode === "demo" ? "sample labels" : "typed decisions";
  $("#familyLabel").textContent = mode === "demo" ? "sample groups" : "creative families";
  $("#decisions").textContent = fmt(
    ads.reduce((sum, a) => sum + Object.keys(a.labels || {}).length, 0),
  );
  $("#progress").style.width =
    (total.length ? (ads.length / total.length) * 100 : 0) + "%";
  $("#queue").textContent = `${fmt(ads.length)} / ${fmt(total.length)}`;
  $("#cost").textContent =
    mode === "demo" ? "DEMO" : "$" + Number((real.decisionsCost || 0) + (real.jevCost || 0)).toFixed(4);
  $("#costLabel").textContent =
    mode === "demo" ? "no provider charges" : real.ads.some(a => a.status === "complete" && a.analysisProvider === "openai") ? (real.unknownCostRequests ? "partial estimate · some usage unknown" : replay ? "earlier run usage estimate" : "earlier run usage estimate") : "estimated Jev usage only";
  $("#filterCount").textContent = `${fmt(selected(ads).length)} / ${fmt(ads.length)} matching`;
  document.body.classList.toggle("complete", (mode === "demo" || replay) && count === replayLength());
  renderInspector(ads);
  renderWall(ads, total);
  renderMap(ads);
  renderFindings(ads);
  const briefs =
    mode === "demo"
      ? demo.briefs
          .filter((b) => ads.some((a) => a.id === b.sourceIds[0]))
          .slice(0, Math.floor((count / demo.ads.length) * 24))
      : real.briefs || [];
  renderBriefs(briefs, ads);
  if (mode !== "demo") {
    $("#activity").textContent = [
      real.error || "",
      ...(real.events || []).map((e) => `${e.time.slice(11, 19)} ${e.message}`),
      ...real.ads.filter((a) => a.error).map((a) => `${a.id}: ${a.error}`),
    ]
      .filter(Boolean)
      .join("\n");
    $("#context").textContent =
      `${real.analysisScope?.advertiser ? real.analysisScope.advertiser + " · " : ""}${fmt(real.ads.length)} ${real.collection ? "collected active ads" : "imported records"}. ${real.ads.filter((a) => a.status === "failed").length} need attention. Click a creative to inspect its evidence.`;
    $("#runId").value = real.collection?.runId || $("#runId").value;
  }
  updatePlaybackControls();
  updateTimer();
  renderScan();
}
function replayLength() {
  return mode === "demo" ? demo.ads.length : (replay?.ads || real.ads.filter(a => a.status === "complete")).length;
}
function canReplay() {
  return mode === "demo" || (!serverBusy && !["running", "collecting", "writing"].includes(real.status) && replayLength() > 0);
}
function updatePlaybackControls() {
  for (const id of ["play", "restart", "duration", "scanStyle"]) $("#" + id).disabled = !canReplay();
  $("#durationLabel").hidden = $("#scanStyle").value === "close";
  const ready = mode === "demo" ? count === demo.ads.length : !replay || count === replay.ads.length;
  $("#play").textContent = playing ? "Ⅱ Pause replay" : ready ? "▶ Replay run" : "▶ Continue replay";
  $("#play").setAttribute("aria-pressed", String(playing));
  $("#replayNote").textContent = mode === "demo"
    ? "Sample data. No API calls."
    : canReplay() ? `${fmt(replayLength())} saved ads${mode !== "demo" && real.ads.some(a => a.status === "complete" && (a.analysisProvider || "jev") !== real.analysisProvider) ? " · earlier provider results" : ""}${$("#scanStyle").value === "close" ? ` · ${CLOSEUP_SECONDS}s per ad` : ""}. No new AI calls.` : serverBusy ? "Replay is available when the current job finishes." : "Analyze ads first to save a run for replay.";
  $("#modeBadge").textContent = mode === "demo"
    ? hasImageLibrary ? "DEMO DATA · PUBLIC IMAGES" : "DEMO DATA"
    : replay && count < replay.ads.length ? "REAL DATA REPLAY" : "LOCAL RESEARCH";
  $("#finishReplay").hidden = !replay || count === replay.ads.length;
  $("#nextCreatives").disabled = playing;
}
function setPlaying(value) {
  if (playing && !value) wallOffset = Math.max(0, selected(shown).length - 72);
  playing = value;
  last = performance.now();
  document.body.classList.toggle("paused", !value);
  for (const effect of scanEffects) value || count === replayLength() ? effect.animation.play() : effect.animation.pause();
  updatePlaybackControls();
}
function restart() {
  if (mode !== "demo") {
    if (!canReplay()) return;
    // This fixed snapshot never changes the saved run or calls a provider.
    replay = { ads: [...real.ads.filter(a => a.status === "complete")] };
  }
  elapsed = 0;
  count = 0;
  scanSession = true;
  scanAdId = null;
  scanPhase = 0;
  clearScanEffects();
  filter = null;
  selectedId = null;
  wallOffset = 0;
  $("#formatFilter").value = "";
  $("#hookFilter").value = "";
  briefSignature = "";
  $(".wall-viewport").scrollTop = 0;
  wallCards.clear();
  render();
  updateTimer();
}
function updateTimer() {
  if (mode !== "demo" && !replay) {
    $("#timer").textContent = title(real.status || "Loading");
    return;
  }
  $("#timer").textContent =
    count === replayLength() && !playing ? mode === "demo" ? "DEMO READY" : "REPLAY COMPLETE" : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
}
let lastPaint = 0;
function frame(now) {
  if ((mode === "demo" || replay) && playing && !document.hidden) {
    elapsed = Math.min(
      playbackDuration(),
      elapsed + Math.min(.1, (now - last) / 1000),
    );
    const currentFrame = replayFrame(replayLength(), elapsed, $("#scanStyle").value, $("#duration").value);
    if (currentFrame.completed !== count && (now - lastPaint > 80 || $("#scanStyle").value === "close")) {
      const previous = count;
      count = currentFrame.completed;
      scanPhase = currentFrame.phase;
      selectedId = null;
      render();
      animateClassified(previous, count);
      updateTimer();
      lastPaint = now;
    }
    renderScan(currentFrame.completed === count ? currentFrame.phase : 1);
    updateTimer();
    if (count === replayLength()) {
      setPlaying(false);
      render();
      updateTimer();
    }
  }
  last = now;
  requestAnimationFrame(frame);
}
async function refresh() {
  if (mode === "demo" || replay || polling) return;
  polling = true;
  try {
    real = await api("state");
    const c = await api("config");
    serverBusy = c.busy;
    $("#connections").textContent =
      `Keys configured (not a connection test): Jev ${c.jev ? "yes" : "no"} · Apify ${c.apify ? "yes" : "no"} · Speech ${c.speech ? "yes" : "no"} · Writer ${c.writer ? "yes" : "no"}`;
    render();
  } catch (e) {
    toast(e.message);
  } finally {
    polling = false;
  }
}
function setMode(next) {
  setPlaying(false);
  mode = next;
  replay = null;
  scanSession = false;
  scanAdId = null;
  clearScanEffects();
  wallCards.clear();
  filter = null;
  selectedId = null;
  wallOffset = 0;
  $("#formatFilter").value = "";
  $("#hookFilter").value = "";
  briefSignature = "";
  exampleDimension = 'format'; exampleKey = null; exampleOffset = 0; exampleAdId = null; exampleSignature = '';
  $("#exampleOlder").checked = false;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#workflow").hidden = mode === "demo";
  $("#importPanel").hidden = mode !== "import";
  $("#collectPanel").hidden = mode !== "collect";
  $("#modeBadge").textContent =
    mode === "demo"
      ? hasImageLibrary
        ? "DEMO DATA · PUBLIC IMAGES"
        : "DEMO DATA"
      : "LOCAL RESEARCH";
  $("#disclosure").textContent =
    mode === "demo"
      ? hasImageLibrary
        ? "SIMULATION · Public creative images. Labels, graph positions, timing and brief scores are illustrative, not a Jev run."
        : "SIMULATION · Fictional brands, synthetic dates, labels and scores. AI-generated illustrative creatives."
      : "Age is not continuous runtime or profitability. Rubric scores are not performance predictions. Inspect the source evidence.";
  $("#briefDescription").textContent =
    mode === "demo"
      ? "Sample haircare briefs linked to the demo patterns. Clarity, brand fit and claim support scores are illustrative."
      : "Original outlines or writer drafts. Jev reviews clarity, fit and claim support.";
  if (mode === "demo") {
    count = demo.ads.length;
    elapsed = Number($("#duration").value);
    $("#context").innerHTML = hasImageLibrary
      ? `${fmt(demo.ads.length)} public inspiration images, ready to explore.<br>Sample labels, dates and findings. No keys needed.`
      : "A fictional haircare market, ready to explore.<br>Sample creatives, labels, dates and findings. No keys needed.";
    updateTimer();
    render();
  } else refresh();
}
$('[data-mode="demo"]').onclick = () => setMode("demo");
$('[data-mode="import"]').onclick = () => setMode("import");
$('[data-mode="collect"]').onclick = () => setMode("collect");
$("#play").onclick = () => {
  if (!canReplay()) return;
  if ((mode !== "demo" && !replay) || count === replayLength()) restart();
  setPlaying(!playing);
  render();
};
$("#restart").onclick = () => {
  if (!canReplay()) return;
  restart();
  setPlaying(true);
};
$("#duration").onchange = () => {
  elapsed = count / Math.max(1, replayLength()) * playbackDuration();
  last = performance.now();
  updateTimer();
};
$("#scanStyle").onchange = () => {
  elapsed = count / Math.max(1, replayLength()) * playbackDuration();
  scanAdId = null;
  scanPhase = 0;
  last = performance.now();
  clearScanEffects();
  render();
};
$("#finishReplay").onclick = () => {
  setPlaying(false);
  replay = null;
  scanSession = false;
  clearScanEffects();
  wallOffset = 0;
  render();
};
$("#dimension").onchange = () => {
  filter = null;
  selectedId = null;
  wallOffset = 0;
  render();
};
for (const key of ["formatFilter", "hookFilter"]) $("#" + key).onchange = () => {
  filter = null;
  selectedId = null;
  wallOffset = 0;
  exampleDimension = key === 'formatFilter' ? 'format' : 'hook'; exampleKey = $("#" + key).value; exampleOffset = 0; exampleAdId = null; exampleSignature = '';
  $("#exampleOlder").checked = false;
  render();
};
$("#resetFilters").onclick = () => {
  $("#formatFilter").value = "";
  $("#hookFilter").value = "";
  filter = null;
  selectedId = null;
  wallOffset = 0;
  exampleDimension = 'format'; exampleKey = null; exampleOffset = 0; exampleAdId = null; exampleSignature = '';
  $("#exampleOlder").checked = false;
  render();
};
$("#nextCreatives").onclick = () => {
  const subset = selected(shown);
  wallOffset = wallOffset + 72 >= subset.length ? 0 : wallOffset + 72;
  renderWall(shown, mode === "demo" ? demo.ads : real.ads);
  $(".wall-viewport").scrollTop = 0;
};
$("#clean").onclick = $("#showControls").onclick = () =>
  document.body.classList.toggle("clean");
$("#record").onclick = () => {
  document.body.classList.toggle("portrait");
  $("#record").textContent = document.body.classList.contains("portrait")
    ? "Wide view"
    : "Portrait";
};
$("#closeDetail").onclick = () => $("#detail").close();
$("#exampleDimension").onchange = () => {
  exampleDimension = $("#exampleDimension").value; exampleKey = null; exampleOffset = 0; exampleAdId = null; exampleSignature = '';
  $("#formatFilter").value = ''; $("#hookFilter").value = ''; $("#dimension").value = exampleDimension; filter = null; render();
};
$("#examplePattern").onchange = () => explorePattern(exampleDimension, $("#examplePattern").value, null, false);
$("#exampleOlder").onchange = $("#exampleSort").onchange = () => { exampleOffset = 0; exampleAdId = null; exampleSignature = ''; render(); };
$("#examplePrevious").onclick = () => { exampleOffset = Math.max(0, exampleOffset - 12); exampleAdId = null; exampleSignature = ''; render(); };
$("#exampleNext").onclick = () => { if (exampleOffset + 12 < exampleTotal) exampleOffset += 12; exampleAdId = null; exampleSignature = ''; render(); };
$("#closeMapSelection").onclick = () => { mapClusterKey = null; renderMap(shown); };
$("#mapView").onchange = () => { mapClusterKey = null; mapClusterOffset = 0; renderMap(shown); };
$("#mapPrevious").onclick = () => { mapClusterOffset = Math.max(0, mapClusterOffset - 12); renderMapSelection(); };
$("#mapNext").onclick = () => { mapClusterOffset += 12; renderMapSelection(); };
new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  if (width > 0 && Math.abs(width - mapWidth) >= 1) { mapWidth = width; renderMap(shown); }
}).observe($("#map"));
document.addEventListener("click", (e) => {
  const stack = e.target.closest("[data-map-cluster]");
  if (stack) { mapClusterKey = stack.dataset.mapCluster; mapClusterOffset = 0; selectCreative(stack.dataset.ad); return; }
  const example = e.target.closest("[data-example-ad]");
  if (example) {
    setPlaying(false); exampleAdId = example.dataset.exampleAd; selectedId = exampleAdId; render();
    if (innerWidth <= 700) $("#exampleDetail").scrollIntoView({block:'start'});
    return;
  }
  const ad = e.target.closest("[data-ad]");
  if (ad) {
    selectCreative(ad.dataset.ad);
    if (ad.classList.contains("source-thumb")) $(".filter-toolbar").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }
  const detail = e.target.closest("[data-detail]");
  if (detail) showDetail(detail.dataset.detail);
  const finding = e.target.closest("[data-finding]");
  if (finding) explorePattern(finding.dataset.dimension, finding.dataset.finding, finding.dataset.preview || null);
  const p = e.target.closest("[data-pattern]");
  if (p) {
    filter = filter === p.dataset.pattern ? null : p.dataset.pattern;
    selectedId = null;
    wallOffset = 0;
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea,select") || $("#detail").open) return;
  if (e.key === "c") document.body.classList.toggle("clean");
  if (e.key === "r" && canReplay()) {
    restart();
    setPlaying(true);
  }
  if (
    e.code === "Space" &&
    canReplay() &&
    !e.target.matches("button,[role=button]")
  ) {
    e.preventDefault();
    $("#play").click();
  }
  if (!e.target.matches("button") && (e.key === "Enter" || e.code === "Space") && e.target.matches("[data-ad],[data-pattern],[data-map-cluster]")) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});
$("#addText").onclick = () =>
  action(async () => {
    if (!$("#adText").value.trim())
      throw new Error("Paste some ad copy first.");
    await api("import", {
      ads: [{ brand: $("#adBrand").value, text: $("#adText").value }],
    });
  });
$("#jsonFile").onchange = () =>
  action(async () => {
    const f = $("#jsonFile").files[0];
    if (!f) return;
    const data = JSON.parse(await f.text());
    await api("import", { ads: Array.isArray(data) ? data : data.ads });
    $("#jsonFile").value = "";
  });
$("#mediaFile").onchange = () =>
  action(async () => {
    for (const f of $("#mediaFile").files) {
      if (f.size > 60 * 1024 * 1024)
        throw new Error("Files must be under 60 MB.");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      await api("upload", {
        name: f.name,
        base64,
        kind: f.type.startsWith("video/") ? "video" : "image",
      });
    }
    $("#mediaFile").value = "";
  });
$("#analyze").onclick = $("#collectAnalyze").onclick = () =>
  action(() => api("analyze", {}));
$("#collect").onclick = () =>
  action(() =>
    api("collect", {
      urls: $("#urls")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      limit: Number($("#limit").value),
      budget: Number($("#budget").value),
    }),
  );
$("#attach").onclick = () =>
  action(() => api("attach", { runId: $("#runId").value.trim() }));
$("#briefs").onclick = () =>
  action(() =>
    api("briefs", {
      name: $("#product").value,
      audience: $("#audience").value,
      facts: $("#facts").value,
      offer: $("#offer").value,
    }),
  );
$("#export").onclick = () => {
  if (mode !== "demo") {
    location.href = "/api/export";
    return;
  }
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { source: "SIMULATION: synthetic dates, labels, grouping, copy and brief scores. Artwork is illustrative; no provider run.", ...demo },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "simulated-ad-patterns.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
try {
  const bank = await api("demo-library");
  if (bank.images?.length) {
    Object.assign(demo, demoData(bank.images));
    hasImageLibrary = true;
  }
} catch {}
// Open on the useful result. Replaying the fixture is an explicit action.
count = demo.ads.length;
elapsed = Number($("#duration").value);
setMode(["collect", "import"].includes(params.get("mode")) ? params.get("mode") : "demo");
setPlaying(false);
updateTimer();
render();
requestAnimationFrame(frame);
setInterval(refresh, 1800);
if (params.get("autoplay") === "1" && mode === "demo" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  restart();
  setPlaying(true);
}
