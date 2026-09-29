import { demoData } from "./demo.mjs";
import { ageDays, families, summarize, title } from "./core.mjs";
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
const pos = (tile) =>
  `${((tile % 4) / 3) * 100}% ${(Math.floor(tile / 4) / 3) * 100}%`;
const preview = (ad) =>
  ad.imageUrl?.startsWith("/uploads/") ||
  ad.imageUrl?.startsWith("/demo-images/")
    ? ad.imageUrl
    : ad.imageUrl
      ? "/api/media?url=" + encodeURIComponent(ad.imageUrl)
      : null;
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
    await fn();
    await refresh();
  } catch (e) {
    toast(e.message);
  }
}
function label(ad, key) {
  return ad.labels?.[key]?.value || "unknown";
}
function selected(ads) {
  return filter
    ? ads.filter((a) => label(a, $("#dimension").value) === filter)
    : ads;
}
function showDetail(id) {
  const a = (mode === "demo" ? demo.ads : real.ads).find((a) => a.id === id);
  if (!a) return;
  const age = ageDays(a);
  $("#detailBody").innerHTML =
    `${art(a, "detail-art")}<p class="eyebrow">${esc(a.source)} · ${esc(a.id)}</p><h2>${esc(a.brand)}</h2><p>${esc(a.headline || "Creative evidence")}</p><p>${age === null ? "Start date unknown" : age + " days since reported start"} · ${a.active === true ? "Active at collection" : a.active === false ? "Inactive at collection" : "Active status unknown"}</p><p>${esc(a.text || "No ad copy supplied.")}</p>${a.error ? `<p class="error">${esc(a.error)}</p>` : ""}<div style="clear:both"></div><h3>${mode === "demo" ? "Simulated labels, not a Jev result" : "Typed labels"}</h3><ul>${
      Object.entries(a.labels || {})
        .map(
          ([k, v]) =>
            `<li>${esc(title(k))}: <b>${esc(title(v.value))}</b> · confidence ${Math.round(v.confidence * 100)}%</li>`,
        )
        .join("") || "<li>Not classified yet</li>"
    }</ul><details><summary>OCR and transcript evidence</summary><p>${esc(a.ocr || "No OCR text.")}</p><p>${esc(a.transcript || "No speech transcript.")}</p><p>${esc(a.visualNotes || "No visual observations supplied.")}</p>${a.warning ? `<p>${esc(a.warning)}</p>` : ""}</details>${a.url ? `<p><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open source example ↗</a></p>` : "<p>No original campaign link was supplied.</p>"}`;
  $("#detail").showModal();
}
function renderWall(ads, total) {
  const visibleIDs = new Set(ads.map((a) => a.id));
  const subset = selected(ads),
    all = selected(total);
  const head = Math.max(0, subset.length - 16),
    recent = subset.slice(head, head + 16);
  const pending = all
    .filter((a) => !visibleIDs.has(a.id))
    .slice(0, Math.max(0, 24 - recent.length));
  const cards = [...recent, ...pending].slice(-24);
  $("#wall").innerHTML =
    cards
      .map(
        (a) =>
          `<button class="creative ${ads.includes(a) ? "" : "pending"} ${a.id === subset.at(-1)?.id ? "current" : ""}" data-ad="${esc(a.id)}" aria-label="Inspect ${esc(a.brand)} creative">${art(a)}<span class="tile-brand">${esc(a.brand)}</span><span class="tile-tag">${ads.includes(a) ? esc(title(label(a, $("#dimension").value))) : "Queued"} · ${ageDays(a) ?? "?"}d</span></button>`,
      )
      .join("") || '<p class="empty">Import creative evidence to start.</p>';
  $("#currentLabel").textContent = subset.length
    ? `${subset.at(-1).brand} / ${title(label(subset.at(-1), "hook"))}`
    : "Waiting for the first creative";
}
function renderMap(ads) {
  const groups = families(selected(ads)),
    dated = groups.filter((g) => g.age !== null);
  const xmax = Math.max(240, ...dated.map((g) => g.age)),
    ymax = Math.max(24, ...dated.map((g) => g.n));
  const x = (v) => 38 + (v / xmax) * 507,
    y = (v) => 308 - (v / ymax) * 284;
  let svg = `<rect x="${x(60)}" y="20" width="${545 - x(60)}" height="288" fill="#d6fa6007"/><line x1="${x(60)}" y1="20" x2="${x(60)}" y2="308" stroke="#7b8e40" stroke-dasharray="3 5"/><text x="${x(60) + 8}" y="15" style="fill:#b5c981">60 DAYS</text>`;
  for (let i = 0; i <= 4; i++) {
    const yy = 308 - (i / 4) * 284;
    svg += `<line x1="38" y1="${yy}" x2="545" y2="${yy}" stroke="#222923"/><text x="28" y="${yy + 3}" text-anchor="end">${Math.round((ymax * i) / 4)}</text><text x="${38 + (i / 4) * 507}" y="330" text-anchor="middle">${Math.round((xmax * i) / 4)}d</text>`;
  }
  svg += dated
    .map(
      (g) =>
        `<circle data-ad="${esc(g.ad.id)}" tabindex="0" role="button" aria-label="${esc(g.ad.brand)}, ${g.n} ad IDs, ${g.age} days" cx="${x(g.age)}" cy="${y(g.n)}" r="${Math.min(7, 2 + Math.sqrt(g.n) * 0.8)}" fill="${g.age >= 60 ? "#d6fa60" : "#9b9f9b"}" opacity=".8"><title>${esc(g.ad.brand)} · ${g.n} observed ad IDs · ${g.age}d</title></circle>`,
    )
    .join("");
  $("#map").innerHTML = svg;
  $("#familyCount").textContent = fmt(families(ads).length);
  $("#mapNote").textContent =
    mode === "demo"
      ? "Synthetic dates · illustrative distribution"
      : `${dated.length} plotted · ${groups.length - dated.length} without active dated evidence`;
  const rows = summarize(ads, $("#dimension").value);
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
  let eligible = briefs;
  if (filter) {
    const ids = new Set(selected(ads).map((a) => a.id));
    eligible = briefs.filter((b) => b.sourceIds.some((id) => ids.has(id)));
  }
  $("#briefCount").textContent = `${eligible.length} BRIEFS`;
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
    '<p class="empty">Briefs will arrive here.<br>Each stays linked to its source creative.</p>';
}
function render() {
  const ads =
    mode === "demo"
      ? demo.ads.slice(0, count)
      : real.ads.filter((a) => a.status === "complete");
  shown = ads;
  const total = mode === "demo" ? demo.ads : real.ads;
  $("#adsCount").textContent = fmt(ads.length);
  $("#decisions").textContent = fmt(
    ads.reduce((sum, a) => sum + Object.keys(a.labels || {}).length, 0),
  );
  $("#progress").style.width =
    (total.length ? (ads.length / total.length) * 100 : 0) + "%";
  $("#queue").textContent = `${fmt(ads.length)} / ${fmt(total.length)}`;
  $("#cost").textContent =
    mode === "demo" ? "DEMO" : "$" + Number(real.jevCost || 0).toFixed(4);
  $("#costLabel").textContent =
    mode === "demo" ? "no provider charges" : "estimated Jev usage only";
  renderWall(ads, total);
  renderMap(ads);
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
    $("#timer").textContent = title(real.status);
    $("#context").textContent =
      `${real.ads.length} imported records. ${real.ads.filter((a) => a.status === "failed").length} need attention. Click a creative to inspect its evidence.`;
    $("#runId").value = real.collection?.runId || $("#runId").value;
  }
}
function setPlaying(value) {
  playing = value;
  last = performance.now();
  document.body.classList.toggle("paused", !value);
  $("#play").textContent = value
    ? "Ⅱ Pause"
    : count === demo.ads.length
      ? "↺ Replay simulation"
      : "▶ Play simulation";
}
function restart() {
  elapsed = 0;
  count = 0;
  filter = null;
  briefSignature = "";
  render();
  updateTimer();
}
function updateTimer() {
  $("#timer").textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
}
let lastPaint = 0;
function frame(now) {
  if (mode === "demo" && playing) {
    elapsed = Math.min(
      Number($("#duration").value),
      elapsed + (now - last) / 1000,
    );
    count = Math.min(
      demo.ads.length,
      Math.floor((elapsed / Number($("#duration").value)) * demo.ads.length),
    );
    if (now - lastPaint > 140) {
      render();
      updateTimer();
      lastPaint = now;
    }
    if (count === demo.ads.length) {
      setPlaying(false);
      render();
      updateTimer();
    }
  }
  last = now;
  requestAnimationFrame(frame);
}
async function refresh() {
  if (mode === "demo" || polling) return;
  polling = true;
  try {
    real = await api("state");
    const c = await api("config");
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
  filter = null;
  briefSignature = "";
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#workflow").hidden = mode === "demo";
  $("#importPanel").hidden = mode !== "import";
  $("#collectPanel").hidden = mode !== "collect";
  for (const id of ["play", "restart", "duration"])
    $("#" + id).disabled = mode !== "demo";
  $("#modeBadge").textContent =
    mode === "demo"
      ? hasImageLibrary
        ? "SIMULATION · PUBLIC IMAGES"
        : "SIMULATED RUN"
      : "LOCAL RESEARCH";
  $("#disclosure").textContent =
    mode === "demo"
      ? hasImageLibrary
        ? "SIMULATION · Public creative images. Labels, graph positions, timing and brief scores are illustrative, not a Jev run."
        : "SIMULATION · Fictional brands, synthetic dates, labels and scores. AI-generated illustrative creatives."
      : "Age is not continuous runtime or profitability. Rubric scores are not performance predictions. Inspect the source evidence.";
  $("#briefDescription").textContent =
    mode === "demo"
      ? "Original demo concepts. Three explicit review criteria."
      : "Original outlines or writer drafts. Jev reviews clarity, fit and claim support.";
  if (mode === "demo") {
    $("#context").innerHTML = hasImageLibrary
      ? `${demo.ads.length.toLocaleString()} distinct image assets. Simulated analysis.<br>No API keys. No real campaign results.`
      : "A fictional haircare market. One connected simulation.<br>No API keys. No real campaign results.";
    updateTimer();
    render();
  } else refresh();
}
$('[data-mode="demo"]').onclick = () => setMode("demo");
$('[data-mode="import"]').onclick = () => setMode("import");
$('[data-mode="collect"]').onclick = () => setMode("collect");
$("#play").onclick = () => {
  if (count === demo.ads.length) restart();
  setPlaying(!playing);
};
$("#restart").onclick = () => {
  restart();
  setPlaying(true);
};
$("#duration").onchange = () => {
  restart();
  setPlaying(false);
};
$("#dimension").onchange = () => {
  filter = null;
  render();
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
document.addEventListener("click", (e) => {
  const ad = e.target.closest("[data-ad]");
  if (ad) showDetail(ad.dataset.ad);
  const p = e.target.closest("[data-pattern]");
  if (p) {
    filter = filter === p.dataset.pattern ? null : p.dataset.pattern;
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea,select") || $("#detail").open) return;
  if (e.key === "c") document.body.classList.toggle("clean");
  if (e.key === "r" && mode === "demo") {
    restart();
    setPlaying(true);
  }
  if (
    e.code === "Space" &&
    mode === "demo" &&
    !e.target.matches("button,[role=button]")
  ) {
    e.preventDefault();
    $("#play").click();
  }
  if (e.key === "Enter" && e.target.matches("[data-ad],[data-pattern]"))
    e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
          { source: "SIMULATION: fictional data", ...demo },
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
    const base = demo.ads;
    demo.ads = [...bank.images]
      .sort((a, b) => a.hash.localeCompare(b.hash))
      .map((a, i) => ({
        ...base[i % base.length],
        id: "visual-" + i,
        brand: a.brand,
        tile: undefined,
        imageUrl: a.imageUrl,
        url: a.url,
        text: a.text || "Public image used to illustrate the interface.",
        headline: "Illustrative analysis of a real image",
        source: "Simulation with public creative image",
        synthetic: true,
      }));
    demo.briefs = demo.briefs.map((b, i) => ({
      ...b,
      sourceIds: [
        demo.ads[Math.floor((i * demo.ads.length) / demo.briefs.length)].id,
      ],
      tile: undefined,
    }));
    hasImageLibrary = true;
    $("#adsCount").nextElementSibling.textContent = "creative images";
  }
} catch {}
setMode("demo");
setPlaying(false);
render();
requestAnimationFrame(frame);
setInterval(refresh, 1800);
if (params.get("autoplay") === "1") setPlaying(true);
