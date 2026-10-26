import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeMany, hash } from "./data.mjs";
import { DECISIONS_VERSION, VISUAL_VERSION } from "./decisions.mjs";
import {
  analysisProvider,
  JEV_VERSION,
  download,
  extract,
  classify,
  startScrape,
  pollScrape,
  dataset,
  makeBrief,
  reviewBrief,
} from "./providers.mjs";
export const root = process.env.LAB_DATA_DIR || join(process.cwd(), "data"),
  cache = join(root, "cache");
let state = {
    id: null,
    ads: [],
    briefs: [],
    status: "idle",
    jevCost: 0,
    decisionsCost: 0,
    unknownCostRequests: 0,
    brand: {},
    events: [],
  },
  running = false;
export async function init() {
  await mkdir(cache, { recursive: true });
  await mkdir(join(root, "uploads"), { recursive: true });
  try {
    state = JSON.parse(await readFile(join(root, "run.json"), "utf8"));
    if (["running", "collecting", "writing"].includes(state.status))
      state.status = "interrupted";
  } catch {}
  return state;
}
let saves = Promise.resolve();
export function save() {
  const json = JSON.stringify(state);
  saves = saves
    .catch(() => {})
    .then(async () => {
      await writeFile(join(root, "run.tmp"), json, { mode: 0o600 });
      await rename(join(root, "run.tmp"), join(root, "run.json"));
    });
  return saves;
}
export function getState() {
  return state;
}
export function busy() {
  return running;
}
function event(message) {
  state.events.push({ time: new Date().toISOString(), message });
  state.events = state.events.slice(-80);
}
export async function importRows(rows, brand = {}) {
  if (running) throw new Error("Wait for the current job before importing.");
  const ads = normalizeMany(rows);
  state = {
    id: randomUUID(),
    ads,
    briefs: [],
    status: "ready",
    jevCost: 0,
    decisionsCost: 0,
    unknownCostRequests: 0,
    brand,
    events: [],
  };
  event(`Imported ${ads.length} ad records.`);
  await save();
  return state;
}
export async function addUpload({ name, base64, kind }) {
  if (running) throw new Error("Wait for the current job.");
  if (!["image", "video"].includes(kind))
    throw new Error("Choose image or video.");
  const bytes = Buffer.from(base64 || "", "base64");
  if (!bytes.length || bytes.length > 60 * 1024 * 1024)
    throw new Error("File must be between 1 byte and 60 MB.");
  if (
    kind === "image" &&
    !(
      (bytes[0] === 0xff && bytes[1] === 0xd8) ||
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP")
    )
  )
    throw new Error("Upload a valid PNG, JPEG or WebP image.");
  const id = randomUUID();
  const file = join(root, "uploads", id + (kind === "video" ? ".mp4" : ".img"));
  await writeFile(file, bytes, { mode: 0o600 });
  if (!state.id)
    await importRows([{ id, text: "", brand: name || "Uploaded creative" }]);
  const a = normalizeMany([
    { id, brand: name || "Uploaded creative", kind },
  ])[0];
  a.localFile = file;
  a.imageUrl = kind === "image" ? "/uploads/" + id + ".img" : null;
  a.family = hash(bytes).slice(0, 16);
  state.ads = state.ads.filter((p) => p.id !== id);
  state.ads.push(a);
  state.status = "ready";
  event("Uploaded " + (name || "creative"));
  await save();
  return state;
}
export async function processAds() {
  if (running) throw new Error("A job is already running.");
  if (!state.ads.length) throw new Error("Import ads first.");
  if (analysisProvider() === "openai" && !process.env.OPENAI_API_KEY) throw new Error("Add OPENAI_API_KEY to .env and restart before analysing.");
  if (analysisProvider() === "jev" && !process.env.TYPESAFE_API_KEY) throw new Error("Add TYPESAFE_API_KEY to .env and restart before analysing.");
  running = true;
  state.error = null;
  state.status = "running";
  event("Processing imported evidence.");
  await save();
  try {
    const provider = analysisProvider();
    const version = provider === "openai" ? DECISIONS_VERSION : JEV_VERSION;
    const queue = state.ads.filter(ad => !(ad.status === "complete" && (ad.analysisProvider || "jev") === provider && ad.analysisVersion === version));
    let index = 0, stopped = false;
    const concurrency = Math.max(1, Math.min(6, Number(process.env.ANALYSIS_CONCURRENCY) || 4));
    async function worker() {
    while (!stopped && index < queue.length) {
      const ad = queue[index++];
      ad.status = "processing";
      ad.error = null;
      await save();
      try {
        const needsVisualEvidence = ad.visualVersion !== VISUAL_VERSION || !ad.visualFrames?.length;
        if ((!ad.extracted || needsVisualEvidence) && (ad.localFile || ad.mediaUrl)) {
          let file = ad.localFile;
          if (!file) {
            const data = await download(ad.mediaUrl);
            file = join(cache, hash(data.bytes) + ".media");
            await writeFile(file, data.bytes, { mode: 0o600 });
            ad.localFile = file;
            ad.mediaHash = hash(data.bytes);
            ad.family = hash(JSON.stringify([ad.text.trim().toLowerCase(), ad.mediaHash])).slice(0, 16);
          }
          const evidence = await extract(ad, file, cache);
          Object.assign(ad, evidence);
          ad.extracted = true;
          ad.extractionProvider = provider;
          await save();
        }
        if (!ad.visualFrames?.length && ![ad.text, ad.ocr, ad.transcript].some((v) => v?.trim()))
          throw new Error("No creative evidence. Add an image, video, ad copy or transcript.");
        const result = await classify(ad, cache);
        ad.labels = result.labels;
        ad.model = result.model;
        ad.analysisProvider = result.provider || "jev";
        ad.analysisVersion = result.version || JEV_VERSION;
        ad.visualSamples = result.visualSamples || 0;
        ad.sampledTimes = result.sampledTimes || [];
        ad.analysisCost = result.cost;
        ad.costBasis = result.costBasis || "Estimated Jev input cost";
        ad.jevTokens = result.inputTokens;
        ad.cached = result.cached;
        ad.elapsedMs = result.elapsedMs;
        ad.status = "complete";
        if (result.provider === "openai") {
          state.decisionsCost = (state.decisionsCost || 0) + (result.cost || 0);
          if (result.cost === null && !result.cached) state.unknownCostRequests = (state.unknownCostRequests || 0) + 1;
        } else if (result.cost !== null) state.jevCost += result.cost;
        else if (!result.cached) state.unknownCostRequests = (state.unknownCostRequests || 0) + 1;
        event("Classified " + ad.id + (result.cached ? " (cached)" : ""));
      } catch (e) {
        ad.status = "failed";
        ad.error = e.message.startsWith("Command failed:") ? "Media conversion failed. Check the file and FFmpeg installation." : e.message;
        event("Needs attention: " + ad.id);
        if (/OpenAI Decisions HTTP (401|403|429)|OpenAI connection failed|Provider HTTP (401|403|429|529)|Jev connection failed/.test(e.message)) {
          stopped = true;
          state.error = e.message + " Unfinished ads are saved; resume after the provider issue is resolved.";
          if (/may have been billed/.test(e.message)) state.unknownCostRequests = (state.unknownCostRequests || 0) + 1;
        }
      }
      await save();
    }
    }
    await Promise.all(Array.from({length: concurrency}, worker));
    state.status = state.ads.some((a) => a.status !== "complete")
      ? "partial"
      : "complete";
  } finally {
    running = false;
    await save();
  }
}
export async function collect(input, budget) {
  if (running) throw new Error("A job is running.");
  if (!process.env.APIFY_TOKEN)
    throw new Error(
      "Add APIFY_TOKEN to .env and restart. Import and demo still work.",
    );
  running = true;
  state = {
    id: randomUUID(),
    ads: [],
    briefs: [],
    status: "collecting",
    jevCost: 0,
    decisionsCost: 0,
    unknownCostRequests: 0,
    brand: {},
    events: [],
    collection: { input, budget, runId: null, launchPending: true },
  };
  await save();
  event("Starting bounded Apify collection.");
  try {
    const r = await startScrape(input, budget);
    state.collection.runId = r.id;
    state.collection.launchPending = false;
    await save();
    await finishCollection();
  } catch (e) {
    state.status = "collection_error";
    state.error =
      e.message +
      (state.collection.launchPending
        ? " Launch response uncertain. Check Apify Console; attach the existing run ID instead of relaunching."
        : "");
    event(state.error);
  } finally {
    running = false;
    await save();
  }
}
async function finishCollection() {
  const id = state.collection.runId;
  for (let i = 0; i < 180; i++) {
    const r = await pollScrape(id);
    state.collection.providerStatus = r.status;
    await save();
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(r.status)) {
      if (!r.defaultDatasetId) throw new Error("Apify returned no dataset.");
      const rows = await dataset(
        r.defaultDatasetId,
        state.collection.input.count,
      );
      state.ads = normalizeMany(rows, { source: "apify" });
      state.collection.cost = r.usageTotalUsd ?? null;
      state.status = "ready";
      event(
        `Collected ${state.ads.length} records; provider status ${r.status}. Press Analyze to use AI providers.`,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Collection still running. Resume with the existing run ID.");
}
export async function attachRun(id) {
  if (running) throw new Error("A job is running.");
  if (!/^[\w-]{5,100}$/.test(id)) throw new Error("Invalid run ID");
  if (!process.env.APIFY_TOKEN) throw new Error("Apify key missing");
  const previous = state.collection;
  state = {
    id: randomUUID(),
    ads: [],
    briefs: [],
    status: "collecting",
    jevCost: 0,
    decisionsCost: 0,
    unknownCostRequests: 0,
    brand: {},
    events: [],
    collection: {
      ...(previous?.runId === id
        ? previous
        : { input: { count: 1000 }, budget: null }),
      runId: id,
      launchPending: false,
    },
  };
  running = true;
  state.status = "collecting";
  try {
    await finishCollection();
  } catch (e) {
    state.error = e.message;
    state.status = "collection_error";
  } finally {
    running = false;
    await save();
  }
}
export async function writeBriefs(brand) {
  if (running) throw new Error("A job is running.");
  const selected = state.ads
    .filter((a) => a.status === "complete")
    .filter((a, i, all) => all.findIndex((b) => b.family === a.family) === i)
    .slice(0, 6);
  if (!selected.length) throw new Error("Classify at least one ad first.");
  running = true;
  state.status = "writing";
  state.brand = brand;
  state.briefs = [];
  await save();
  try {
    for (const ad of selected) {
      try {
        const brief = await makeBrief(ad, brand);
        brief.review = await reviewBrief(brief, brand);
        if (brief.review?.provider === "openai") {
          state.decisionsCost = (state.decisionsCost || 0) + (brief.review.cost || 0);
          if (brief.review.cost === null) state.unknownCostRequests = (state.unknownCostRequests || 0) + 1;
        } else if (brief.review?.cost != null) state.jevCost += brief.review.cost;
        state.briefs.push(brief);
      } catch (e) {
        event("Brief failed: " + e.message);
      }
      await save();
    }
    state.status =
      state.briefs.length === selected.length ? "complete" : "partial";
  } finally {
    running = false;
    await save();
  }
}
export function publicState() {
  return {
    ...state,
    analysisProvider: analysisProvider(),
    ads: state.ads.map(({ localFile, mediaUrl, visualFrames, ...ad }) => ({
      ...ad,
      visualFrames: (visualFrames || []).map(({file,time}) => ({time,url:"/api/frame?ad="+encodeURIComponent(ad.id)+"&index="+(visualFrames || []).findIndex(f=>f.file===file)})),
      hasMedia: !!(localFile || mediaUrl),
    })),
  };
}
export function exportState() {
  return {
    schemaVersion: 1,
    source: "real-import-or-collection",
    exportedAt: new Date().toISOString(),
    jevEstimatedCost: state.jevCost,
    decisionsEstimatedCost: state.decisionsCost ?? null,
    unknownCostRequests: state.unknownCostRequests || 0,
    brand: state.brand,
    briefs: state.briefs,
    ads: state.ads.map(
      ({
        id,
        brand,
        text,
        headline,
        transcript,
        ocr,
        visualNotes,
        startDate,
        collectedAt,
        active,
        url,
        kind,
        family,
        source,
        status,
        labels,
        analysisProvider, analysisVersion, visualSamples, sampledTimes, model, analysisCost, costBasis,
        error,
      }) => ({
        id,
        brand,
        text,
        headline,
        transcript,
        ocr,
        visualNotes,
        startDate,
        collectedAt,
        active,
        url,
        kind,
        family,
        source,
        status,
        labels,
        analysisProvider, analysisVersion, visualSamples, sampledTimes, model, analysisCost, costBasis,
        error,
      }),
    ),
  };
}
