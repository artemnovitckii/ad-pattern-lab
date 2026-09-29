const formats = [
  "creator_demo",
  "product",
  "testimonial",
  "graphic",
  "comparison",
  "founder",
];
const tileBrands = [
  "DEW",
  "FORMA",
  "FORMA",
  "MOSS",
  "LUMA",
  "ORO",
  "LUMA",
  "DEW",
  "MOSS",
  "FORMA",
  "ORO",
  "LUMA",
  "DEW",
  "FORMA",
  "MOSS",
  "LUMA",
];
const formatTiles = {
  creator_demo: [0, 7, 11],
  product: [1, 3, 6, 10, 12, 14],
  testimonial: [2, 13, 15],
  graphic: [4, 9],
  comparison: [8],
  founder: [5],
};
const hooks = [
  "frustration",
  "result",
  "curiosity",
  "direct",
  "contradiction",
  "offer",
];
const copy = [
  "Your routine has enough steps. Meet a simpler wash day.",
  "A little daily care. A routine you can make your own.",
  "What belongs in your next haircare routine?",
  "Meet the essentials. Shampoo, conditioner, a moment for you.",
  "More products are not always the answer. Start with the basics.",
  "Meet the daily care duo. Two essentials, one routine.",
];
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function demoData() {
  const rand = rng(29326),
    ads = [];
  const now = "2026-09-29T12:00:00.000Z";
  for (let family = 0; family < 190; family++) {
    const format = formats[family % 6],
      tile =
        formatTiles[format][
          Math.floor(family / 6) % formatTiles[format].length
        ],
      hook = hooks[family % 6],
      age = Math.floor(rand() * 210 + (format === "creator_demo" ? 35 : 0)),
      count = 1 + Math.floor(rand() ** 2 * 24);
    for (let i = 0; i < count; i++)
      ads.push({
        id: `demo-${family}-${i}`,
        family: `demo-family-${family}`,
        brand: tileBrands[tile],
        text: copy[family % 6],
        headline: [
          "Make room for good hair",
          "Meet your daily ritual",
          "Care without the fuss",
        ][family % 3],
        kind: family % 3 ? "video" : "image",
        tile,
        url: null,
        startDate: new Date(Date.parse(now) - age * 864e5).toISOString(),
        collectedAt: now,
        active: true,
        status: "complete",
        source: "simulation",
        labels: Object.fromEntries(
          Object.entries({
            format,
            hook,
            angle: "convenience",
            offer: family % 4 ? "none" : "bundle",
            proof: format === "testimonial" ? "testimonial" : "demo",
            objection: "effort",
            cta: "buy",
          }).map(([key, value]) => [
            key,
            { value, confidence: 0.7 + rand() * 0.29 },
          ]),
        ),
      });
  }
  // Mix families so a replay feels like a stream, not a block of duplicates.
  const ordered = ads
    .map((a) => ({ a, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.a);
  const briefs = Array.from({ length: 24 }, (_, i) => {
    const a = ordered[(i * 79) % ordered.length];
    return {
      title: [
        "The routine reset",
        "One less thing to think about",
        "Meet your daily essentials",
        "A different kind of wash day",
      ][i % 4],
      hook: [
        "Your shower shelf called. It wants some space back.",
        "Three steps in your routine. Which one earns its place?",
        "A little daily care. Nothing extra to figure out.",
        "Start with the routine, not another promise.",
      ][i % 4],
      beats: [
        "Open on a crowded shelf.",
        "Show the fictional product in a simple routine.",
        "Close with a clear product introduction.",
      ],
      sourceIds: [a.id],
      source: "Simulated brief",
      review: {
        scores: {
          clarity: 72 + Math.floor(rand() * 25),
          fit: 75 + Math.floor(rand() * 23),
          support: 70 + Math.floor(rand() * 29),
        },
      },
      tile: a.tile,
    };
  });
  return { ads: ordered, briefs };
}
