import { spawnSync } from "node:child_process";
console.log("Node:", process.version, "(requires 22.9+)");
for (const n of ["ffmpeg", "ffprobe"])
  console.log(
    n,
    spawnSync(n, ["-version"]).status === 0
      ? "available"
      : "not found; needed only for video files",
  );
for (const [name, key] of Object.entries({
  Jev: "TYPESAFE_API_KEY",
  Apify: "APIFY_TOKEN",
  Fireworks: "FIREWORKS_API_KEY",
  Groq: "GROQ_API_KEY",
  Writer: "LLM_API_KEY",
}))
  console.log(
    name,
    process.env[key] ? "key configured (not verified)" : "not configured",
  );
console.log("Demo requires no provider keys. Doctor makes no paid calls.");
