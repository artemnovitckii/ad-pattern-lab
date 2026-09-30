import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, basename } from "node:path";
import {
  init,
  publicState,
  importRows,
  addUpload,
  processAds,
  collect,
  attachRun,
  writeBriefs,
  exportState,
  root,
  busy,
} from "./lib/pipeline.mjs";
import { apifyInput } from "./lib/data.mjs";
import { download } from "./lib/providers.mjs";
await init();
const port = Number(process.env.PORT || 5194),
  host = "127.0.0.1";
const publicDir = resolve("public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".img": "application/octet-stream",
};
async function body(req) {
  let n = 0;
  const chunks = [];
  for await (const c of req) {
    n += c.length;
    if (n > 85 * 1024 * 1024) throw new Error("Request exceeds 85 MB");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error("Invalid JSON request");
  }
}
const run = (p) => p.catch((e) => console.error("Job failed:", e.message));
const server = http.createServer(async (req, res) => {
  const send = (code, data) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host))
      return send(403, { error: "Local host only" });
    if (
      req.headers.origin &&
      !["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
        req.headers.origin,
      )
    )
      return send(403, { error: "Cross-origin request refused" });
    const url = new URL(req.url, "http://127.0.0.1:" + port),
      path = url.pathname;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.method === "GET" && path === "/api/demo-library") {
      try {
        return send(
          200,
          JSON.parse(await readFile(join(root, "demo-library.json"), "utf8")),
        );
      } catch {
        return send(200, { images: [] });
      }
    }
    if (req.method === "GET" && path === "/api/state")
      return send(200, publicState());
    if (req.method === "GET" && path === "/api/config")
      return send(200, {
        jev: !!process.env.TYPESAFE_API_KEY,
        apify: !!process.env.APIFY_TOKEN,
        speech: !!(process.env.FIREWORKS_API_KEY || process.env.GROQ_API_KEY),
        writer: !!(process.env.LLM_API_KEY && process.env.LLM_MODEL),
        busy: busy(),
      });
    if (req.method === "GET" && path === "/api/export") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="ad-pattern-lab.json"',
      );
      return send(200, exportState());
    }
    if (req.method === "GET" && path === "/api/media") {
      const { bytes, type } = await download(
        url.searchParams.get("url"),
        12 * 1024 * 1024,
      );
      if (!/^image\/(jpeg|png|webp)/i.test(type))
        throw new Error("Preview must be a raster image");
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "private,max-age=3600",
      });
      return res.end(bytes);
    }
    if (req.method === "POST") {
      if (!String(req.headers["content-type"]).startsWith("application/json"))
        return send(415, { error: "JSON required" });
      const data = await body(req);
      if (path === "/api/import")
        return send(200, await importRows(data.ads, data.brand));
      if (path === "/api/upload") return send(200, await addUpload(data));
      if (path === "/api/analyze") {
        if (busy()) throw new Error("A job is running");
        if (!publicState().ads.length) throw new Error("Import ads first");
        run(processAds());
        return send(202, { started: true });
      }
      if (path === "/api/collect") {
        if (busy()) throw new Error("A job is running");
        if (!process.env.APIFY_TOKEN)
          throw new Error("Apify key missing. Add it to .env and restart.");
        const budget = Number(data.budget);
        if (!Number.isFinite(budget) || budget <= 0 || budget > 20)
          throw new Error("Choose an Apify cap between $0.01 and $20");
        const input = apifyInput(data.urls, Number(data.limit));
        run(collect(input, budget));
        return send(202, { started: true });
      }
      if (path === "/api/attach") {
        if (busy()) throw new Error("A job is running");
        if (!process.env.APIFY_TOKEN) throw new Error("Apify key missing");
        if (!/^[\w-]{5,100}$/.test(data.runId || ""))
          throw new Error("Invalid run ID");
        run(attachRun(data.runId));
        return send(202, { started: true });
      }
      if (path === "/api/briefs") {
        if (busy()) throw new Error("A job is running");
        if (!publicState().ads.some((a) => a.status === "complete"))
          throw new Error("Classify an ad first");
        const brand = Object.fromEntries(
          ["name", "audience", "facts", "offer"].map((k) => [
            k,
            String(data[k] || "").slice(0, 5000),
          ]),
        );
        run(writeBriefs(brand));
        return send(202, { started: true });
      }
      return send(404, { error: "Unknown endpoint" });
    }
    if (req.method !== "GET") return send(405, { error: "Method not allowed" });
    let file;
    if (path.startsWith("/demo-images/")) {
      const name = basename(path);
      if (!/^[a-f0-9]{24}\.jpg$/.test(name))
        throw new Error("Invalid demo image");
      file = join(root, "demo-images", name);
    } else if (path.startsWith("/uploads/")) {
      const name = basename(path);
      if (!/^[\w-]+\.img$/.test(name)) throw new Error("Invalid image");
      file = join(root, "uploads", name);
    } else {
      file = resolve(
        publicDir,
        "." + decodeURIComponent(path === "/" ? "/index.html" : path),
      );
      if (!file.startsWith(publicDir + "/"))
        return send(403, { error: "Invalid path" });
    }
    const bytes = await readFile(file);
    let type = types[extname(file)] || "application/octet-stream";
    if (extname(file) === ".img") {
      type =
        bytes[0] === 0x89
          ? "image/png"
          : bytes[0] === 0xff
            ? "image/jpeg"
            : "image/webp";
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": path.startsWith("/demo-images/")
        ? "private,max-age=31536000,immutable"
        : "no-cache",
    });
    res.end(bytes);
  } catch (e) {
    if (!res.headersSent)
      send(e.code === "ENOENT" ? 404 : 400, {
        error: e.code === "ENOENT" ? "Not found" : e.message,
      });
    else res.end();
  }
});
server.listen(port, host, () =>
  console.log(`Ad Pattern Lab: http://${host}:${port} (Demo needs no keys)`),
);
