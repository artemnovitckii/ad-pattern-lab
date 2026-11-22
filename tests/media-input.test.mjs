import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "../lib/providers.mjs";

const tools = ["ffmpeg", "ffprobe"].filter(bin => spawnSync(bin, ["-version"]).status !== 0);
const skip = tools.length ? `${tools.join(" and ")} unavailable on PATH` : false;

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), "media-input-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

for (const [format, text] of [
  ["hls", "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-ENDLIST\n"],
  ["concat", "ffconcat version 1.0\n"],
]) {
  test(`media preparation rejects ${format} content renamed to .mp4 at the demuxer`, { skip }, async t => {
    const dir = await tempDir(t);
    const file = join(dir, "upload.mp4");
    await writeFile(file, text);

    await assert.rejects(extract({ kind: "image" }, file, dir), error => {
      assert.match(error.cmd, /-protocol_whitelist file -format_whitelist \S+ -i /,
        "media preparation must restrict protocols and formats before opening the input");
      const formats = error.cmd.match(/-format_whitelist (\S+)/)[1].split(",");
      assert.ok(!formats.includes(format), `${format} must stay outside the format whitelist`);
      return true;
    });
    assert.deepEqual(await readdir(dir), ["upload.mp4"]);
  });
}

test("a generated MP4 and JPEG, PNG and WebP still produce JPEG frames", { skip }, async t => {
  const dir = await tempDir(t);
  const clip = join(dir, "clip.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=red:s=64x64:d=1", "-c:v", "mpeg4", clip]);
  const video = await extract({ kind: "video" }, clip, dir);
  assert.equal(video.visualFrames.length, 4);
  const media = await readFile(clip);
  await writeFile(join(dir, "download.media"), media);
  assert.equal((await extract({ kind: "video" }, join(dir, "download.media"), dir)).visualFrames.length, 4);

  for (const format of ["jpg", "png", "webp"]) {
    const file = join(dir, `still.${format}`);
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=red:s=64x64", "-frames:v", "1", file]);
    const prepared = await extract({ kind: "image" }, file, dir);
    assert.equal(prepared.visualFrames.length, 1);
    const jpeg = await readFile(prepared.visualFrames[0].file);
    assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8]);
  }
  const upload = join(dir, "upload.img");
  await writeFile(upload, await readFile(new URL("../public/assets/demo-creatives.jpg", import.meta.url)));
  assert.equal((await extract({ kind: "image" }, upload, dir)).visualFrames.length, 1);
});

test("unsupported uploaded media is recorded as a per-item failure", { skip }, async t => {
  const dir = await tempDir(t);
  const runtime = { LAB_DATA_DIR: dir, ANALYSIS_PROVIDER: "jev", TYPESAFE_API_KEY: "unused-test-key" };
  for (const [key, value] of Object.entries(runtime)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected provider call"); });
  const { addUpload, busy, init, processAds, publicState } = await import("../lib/pipeline.mjs");
  await init();
  await addUpload({ name: "playlist.mp4", kind: "video", base64: Buffer.from("ffconcat version 1.0\n").toString("base64") });
  await processAds();

  const state = publicState();
  assert.equal(state.status, "partial");
  assert.equal(state.ads[0].status, "failed");
  assert.match(state.ads[0].error, /Could not inspect video/);
  assert.deepEqual(state.ads[0].visualFrames, []);
  assert.equal(busy(), false);
  assert.equal(fetch.mock.callCount(), 0);
});
