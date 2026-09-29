import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const [input, recordFile] = process.argv.slice(2);
if (!input) {
  console.log(
    "Usage: npm run demo:images -- /path/to/image-folder [source-records.json]\nAlso accepts a JSON array of {path,brand,url,text} or a page-assets manifest. Local files only; no paid calls.",
  );
  process.exit(1);
}
const target = resolve(input),
  info = await stat(target);
let files = [];
if (info.isDirectory()) {
  for (const name of await readdir(target))
    if (/\.(jpe?g|png|webp)$/i.test(name))
      files.push({ path: join(target, name), name });
} else {
  const raw = JSON.parse(await readFile(target, "utf8"));
  files = Array.isArray(raw) ? raw : raw.assets || [];
  files = files.filter(
    (a) =>
      a.path && (/\.(jpe?g|png|webp)$/i.test(a.path) || a.kind === "image"),
  );
  files = files.map((a) => ({ ...a, path: resolve(target, "..", a.path) }));
}
let records = [];
if (recordFile) {
  const r = JSON.parse(await readFile(recordFile, "utf8"));
  records = Array.isArray(r) ? r : r.ads || [];
}
const canonical = (u) => {
  try {
    return new URL(u).origin + new URL(u).pathname;
  } catch {
    return u;
  }
};
const byImage = new Map(
  records.filter((r) => r.imageUrl).map((r) => [canonical(r.imageUrl), r]),
);
const out = resolve("data/demo-images");
await mkdir(out, { recursive: true });
const manifestFile = resolve("data/demo-library.json");
let existing = [];
try {
  existing = JSON.parse(await readFile(manifestFile, "utf8")).images || [];
} catch {}
const images = new Map(existing.map((x) => [x.hash, x])),
  pending = new Set();
let cursor = 0,
  failed = 0,
  added = 0;
try {
  await exec("ffmpeg", ["-version"], { timeout: 5000 });
} catch {
  throw new Error("Install FFmpeg first, then rerun the image import.");
}
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < files.length) {
      const f = files[cursor++];
      try {
        const bytes = await readFile(f.path);
        if (bytes.length > 20 * 1024 * 1024) throw Error("Image too large");
        const hash = createHash("sha256")
          .update(bytes)
          .digest("hex")
          .slice(0, 24);
        if (images.has(hash) || pending.has(hash)) continue;
        pending.add(hash);
        const name = hash + ".jpg";
        await exec(
          "ffmpeg",
          [
            "-y",
            "-v",
            "error",
            "-i",
            f.path,
            "-vf",
            "scale=480:480:force_original_aspect_ratio=decrease",
            "-frames:v",
            "1",
            "-q:v",
            "5",
            join(out, name),
          ],
          { timeout: 30000 },
        );
        const r = byImage.get(canonical(f.url)) || f;
        images.set(hash, {
          hash,
          imageUrl: "/demo-images/" + name,
          brand: r.brand || "Public ad example",
          url: r.url && r.url !== f.url ? r.url : r.sourceUrl || null,
          text: (r.text || r.title || "").slice(0, 1200),
          sourceStartDate: r.startDate || null,
          sourceCollectedAt: r.collectedAt || null,
        });
        added++;
      } catch (e) {
        failed++;
        console.error(
          "Skipped image:",
          f.name || f.path,
          (e.stderr || e.message).split("\n")[0],
        );
      }
    }
  }),
);
await writeFile(
  manifestFile,
  JSON.stringify(
    {
      description:
        "Real image assets only. Demo labels, graph positions, timings and brief scores remain simulated.",
      images: [...images.values()],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    input: files.length,
    added,
    failed,
    totalUnique: images.size,
    manifest: manifestFile,
  }),
);
