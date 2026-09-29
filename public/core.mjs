export const title = (s) =>
  String(s || "unknown")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const median = (v) => {
  const a = v.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : null;
};
export function ageDays(ad) {
  if (!ad.startDate || !ad.collectedAt) return null;
  const n = (Date.parse(ad.collectedAt) - Date.parse(ad.startDate)) / 864e5;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
export function summarize(ads, dimension = "format") {
  const map = new Map();
  for (const a of ads) {
    if (a.status !== "complete") continue;
    const k = a.labels?.[dimension]?.value || "unknown";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  return [...map]
    .map(([key, rows]) => {
      const dated = rows.filter(
        (a) => a.active === true && ageDays(a) !== null,
      );
      return {
        key,
        n: rows.length,
        families: new Set(rows.map((a) => a.family)).size,
        brands: new Set(rows.map((a) => a.brand)).size,
        medianAge: median(dated.map(ageDays)),
        dated: dated.length,
        old: dated.filter((a) => ageDays(a) >= 60).length,
        share: dated.length
          ? dated.filter((a) => ageDays(a) >= 60).length / dated.length
          : null,
      };
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.n - a.n);
}
export function families(ads) {
  const map = new Map();
  for (const a of ads) {
    if (a.status !== "complete") continue;
    const key = a.family || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return [...map.values()].map((rows) => ({
    ad: rows[0],
    n: rows.length,
    age: median(rows.filter((a) => a.active === true).map(ageDays)),
  }));
}
