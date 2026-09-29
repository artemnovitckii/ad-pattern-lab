import { createHash, randomUUID } from "node:crypto";
const str = (v, n = 20000) => (typeof v === "string" ? v.slice(0, n) : "");
const date = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const x =
    typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isFinite(+x) ? x.toISOString() : null;
};
export function webURL(v) {
  try {
    const u = new URL(v);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export const hash = (v) => createHash("sha256").update(v).digest("hex");
export function normalize(
  row,
  { source = "import", now = new Date().toISOString() } = {},
) {
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw new Error("Each ad must be an object");
  const snap = row.snapshot || {};
  const card = snap.cards?.[0] || {};
  const media =
    row.mediaUrl ||
    row.imageUrl ||
    snap.videos?.[0]?.video_hd_url ||
    snap.videos?.[0]?.video_sd_url ||
    card.video_hd_url ||
    snap.images?.[0]?.original_image_url ||
    card.original_image_url;
  const text = str(
    row.text ||
      row.adText ||
      (typeof snap.body === "object" ? snap.body?.text : snap.body) ||
      row.body ||
      "",
  );
  const id = str(
    String(row.id || row.ad_archive_id || row.adArchiveID || randomUUID()),
    120,
  );
  const image =
    row.imageUrl ||
    snap.videos?.[0]?.video_preview_image_url ||
    snap.images?.[0]?.original_image_url ||
    card.original_image_url ||
    card.video_preview_image_url;
  const active = row.active ?? row.is_active ?? row.isActive;
  const kind =
    row.kind ||
    (snap.videos?.length || card.video_hd_url
      ? "video"
      : media
        ? "image"
        : "text");
  return {
    id,
    brand: str(
      row.brand || row.page_name || row.pageName || "Imported creative",
      150,
    ),
    text,
    headline: str(row.headline || snap.title || card.title, 500),
    transcript: str(row.transcript),
    ocr: str(row.ocr),
    visualNotes: str(row.visualNotes),
    startDate: date(row.startDate ?? row.start_date ?? row.startDateFormatted),
    collectedAt: date(row.collectedAt) || now,
    active: typeof active === "boolean" ? active : null,
    url:
      webURL(row.url || row.adUrl) ||
      (source === "apify" && /^\d+$/.test(id)
        ? `https://www.facebook.com/ads/library/?id=${id}`
        : null),
    imageUrl: webURL(image),
    mediaUrl: webURL(media),
    kind: ["video", "image", "text"].includes(kind) ? kind : "text",
    family: hash(
      JSON.stringify([
        text.trim().toLowerCase(),
        media || image || row.transcript || row.ocr || (text ? "" : id),
      ]),
    ).slice(0, 16),
    source,
    status: "pending",
    labels: null,
    error: null,
  };
}
export function normalizeMany(rows, opts) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
    throw new Error("Import between 1 and 1,000 ad objects");
  const seen = new Set();
  return rows
    .map((r) => normalize(r, opts))
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
}
export function apifyInput(urls, count) {
  if (!Array.isArray(urls) || !urls.length || urls.length > 10)
    throw new Error("Use 1 to 10 Facebook library or page URLs");
  for (const raw of urls) {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      !["www.facebook.com", "facebook.com"].includes(u.hostname) ||
      u.username ||
      u.password
    )
      throw new Error(
        "Use public https://www.facebook.com/ library or page URLs",
      );
  }
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error("Ad limit must be 1 to 1,000");
  return { urls, count, scrapeAdDetails: false };
}
