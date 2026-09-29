import test from "node:test";
import assert from "node:assert/strict";
import { normalize, normalizeMany, apifyInput } from "../lib/data.mjs";
import { requestFor, parseLabels, categories } from "../lib/schema.mjs";
import { ageDays, summarize, families } from "../public/core.mjs";
import {
  mediaURL,
  startScrape,
  classify,
  makeBrief,
} from "../lib/providers.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const now = "2026-09-29T00:00:00.000Z";
test("Apify fields normalize without inventing unavailable metrics", () => {
  const a = normalize(
    {
      ad_archive_id: "123",
      page_name: "Brand",
      start_date: 1750000000,
      is_active: true,
      snapshot: {
        body: { text: "Hello" },
        videos: [
          {
            video_hd_url: "https://video.fbcdn.net/a.mp4",
            video_preview_image_url: "https://img.fbcdn.net/a.jpg",
          },
        ],
      },
    },
    { source: "apify", now },
  );
  assert.equal(a.text, "Hello");
  assert.equal(a.kind, "video");
  assert.equal(a.active, true);
  assert.equal(a.url, "https://www.facebook.com/ads/library/?id=123");
  assert.equal(a.startDate, new Date(1750000000000).toISOString());
  assert.equal(normalize({ text: "No dates" }).active, null);
});
test("deduplicates IDs and exact copy; signed media differences remain separate", () => {
  assert.equal(
    normalizeMany([
      { id: "a", text: "Hi" },
      { id: "a", text: "Hi" },
    ]).length,
    1,
  );
  assert.equal(
    normalize({ id: "a", text: "Hi" }).family,
    normalize({ id: "b", text: "Hi" }).family,
  );
  assert.notEqual(normalize({ id: "a" }).family, normalize({ id: "b" }).family);
  assert.equal(
    normalize({ imageUrl: "https://img.fbcdn.net/a.jpg" }).mediaUrl,
    "https://img.fbcdn.net/a.jpg",
  );
});
test("missing, future and invalid dates do not turn into zero days", () => {
  for (const startDate of [null, "bad", "2030-01-01"])
    assert.equal(ageDays({ startDate, collectedAt: now }), null);
  assert.equal(ageDays({ startDate: "2026-09-28", collectedAt: now }), 1);
});
test("60-day shares use only dated active ads, families do not double count IDs", () => {
  const a = {
    status: "complete",
    family: "a",
    brand: "X",
    labels: { format: { value: "product" } },
    collectedAt: now,
  };
  const ads = [
    { ...a, id: "1", active: true, startDate: "2026-01-01" },
    { ...a, id: "2", active: true, startDate: "2026-09-28" },
    { ...a, id: "3", active: false, startDate: "2026-01-01" },
    { ...a, id: "4", active: true, startDate: null },
    { ...a, id: "5", status: "failed" },
  ];
  const row = summarize(ads)[0];
  assert.equal(row.n, 4);
  assert.equal(row.dated, 2);
  assert.equal(row.old, 1);
  assert.equal(row.share, 0.5);
  assert.equal(families(ads)[0].n, 4);
});
test("Jev classification never receives age or outcome metadata", () => {
  const q = requestFor({
    text: "Copy",
    startDate: now,
    active: true,
    roas: 100,
  });
  assert.equal(q.state.startDate, undefined);
  assert.equal(q.state.roas, undefined);
  assert.equal(Object.keys(q.questions).length, 7);
  const good = {
    answers: Object.fromEntries(
      Object.keys(categories).map((k) => [
        k,
        { type: "choice", choice: "unknown", confidence: 0.2 },
      ]),
    ),
  };
  assert.equal(parseLabels(good).format.value, "unknown");
  good.answers.format.choice = "winner";
  assert.throws(() => parseLabels(good), /invalid/);
});
test("collection validates source and count, remote media rejects private URLs and lookalikes", () => {
  assert.throws(() => apifyInput(["https://example.com"], 50));
  assert.throws(() =>
    apifyInput(["https://www.facebook.com/ads/library/"], 1001),
  );
  assert.equal(
    apifyInput(["https://www.facebook.com/ads/library/"], 50).count,
    50,
  );
  for (const url of [
    "http://127.0.0.1/x",
    "https://fbcdn.net.evil.com/x",
    "https://user:pass@fbcdn.net/x",
    "https://fbcdn.net:444/x",
  ])
    assert.throws(() => mediaURL(url));
  assert.ok(mediaURL("https://scontent.xx.fbcdn.net/x"));
});
test("uncertain Apify launch is not retried", async () => {
  const oldFetch = global.fetch,
    oldKey = process.env.APIFY_TOKEN;
  process.env.APIFY_TOKEN = "test-only";
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("lost response");
  };
  try {
    await assert.rejects(
      startScrape({ urls: [], count: 5 }, 1),
      /connection failed/,
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = oldKey;
  }
});
test("valid Jev contract is cached, repeated requests make no provider call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ad-lab-")),
    oldFetch = global.fetch,
    oldKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "test-only";
  let calls = 0;
  global.fetch = async (url, opt) => {
    calls++;
    const req = JSON.parse(opt.body);
    assert.equal(req.state.copy, "Test");
    return new Response(
      JSON.stringify({
        model: "test",
        usage: { input_tokens: 1000 },
        answers: Object.fromEntries(
          Object.keys(categories).map((k) => [
            k,
            { type: "choice", choice: "unknown", confidence: 0.5 },
          ]),
        ),
      }),
      { status: 200 },
    );
  };
  try {
    const first = await classify({ text: "Test" }, dir),
      second = await classify({ text: "Test" }, dir);
    assert.equal(first.cost, 0.000042);
    assert.equal(second.cost, 0);
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = oldKey;
    await rm(dir, { recursive: true, force: true });
  }
});
test("without a writer, the result is explicitly an editable outline", async () => {
  const key = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const b = await makeBrief(
      { id: "a", labels: { hook: { value: "direct" } } },
      { name: "My product", facts: "Comes in blue" },
    );
    assert.equal(b.source, "Editable outline");
    assert.deepEqual(b.sourceIds, ["a"]);
    assert.ok(b.beats.some((v) => v.includes("Comes in blue")));
  } finally {
    if (key !== undefined) process.env.LLM_API_KEY = key;
  }
});
