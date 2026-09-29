import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
const items = JSON.parse(
  await readFile(
    new URL("../examples/gallery-images.json", import.meta.url),
    "utf8",
  ),
);
const limit = Number(process.argv[2] || items.length);
if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
  throw Error("Use an image limit from 1 to 5000.");
const dir = resolve("data/gallery-source");
await mkdir(dir, { recursive: true });
let next = 0,
  done = 0,
  failed = 0;
const files = [],
  rows = items.slice(0, limit);
console.log(
  `Downloading up to ${rows.length} public reference thumbnails. No AI or Apify calls. Third-party content is not covered by the code license.`,
);
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        const u = new URL(row.url);
        if (
          u.protocol !== "https:" ||
          u.hostname !== "cdn.swipefile.com" ||
          u.username ||
          u.password
        )
          throw Error("Unexpected image host");
        const path = join(
          dir,
          createHash("sha256")
            .update(u.origin + u.pathname)
            .digest("hex")
            .slice(0, 24) + ".jpg",
        );
        try {
          await stat(path);
        } catch {
          const r = await fetch(u, {
            signal: AbortSignal.timeout(25000),
            redirect: "error",
          });
          if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
            throw Error("Image unavailable");
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length > 5e6) throw Error("Image too large");
          await writeFile(path, bytes);
        }
        files.push({ ...row, path });
        done++;
        if (done % 100 === 0) console.log(`${done} downloaded`);
      } catch {
        failed++;
      }
    }
  }),
);
const manifest = join(dir, "manifest.json");
await writeFile(manifest, JSON.stringify(files, null, 2));
console.log(
  `${done} available; ${failed} unavailable. Building local thumbnails.`,
);
if (!files.length) process.exit(1);
const child = spawn(process.execPath, ["scripts/demo-images.mjs", manifest], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
