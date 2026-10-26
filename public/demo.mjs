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
export function demoData(images = []) {
  const rand = rng(29326),
    ads = [];
  const now = "2026-09-29T12:00:00.000Z";
  for (let family = 0; family < 190; family++) {
    const format = formats[family % 6],
      tile =
        formatTiles[format][
          Math.floor(family / 6) % formatTiles[format].length
        ],
      hook = hooks[Math.floor(rand() * hooks.length)],
      older = rand() < ({ creator_demo: .79, comparison: .85, testimonial: .67, founder: .58, graphic: .42, product: .29 }[format]),
      age = older ? 60 + Math.floor(rand() * 160) : 3 + Math.floor(rand() * 55),
      count = 1 + Math.floor(rand() ** 2 * 24);
    for (let i = 0; i < count; i++)
      ads.push({
        id: `demo-${family}-${i}`,
        family: `demo-family-${family}`,
        brand: tileBrands[tile],
        text: copy[hooks.indexOf(hook)],
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
        source: "Simulated research",
        synthetic: true,
        labels: Object.fromEntries(
          Object.entries({
            format,
            hook,
            angle: ["convenience", "performance", "price", "trust", "experience", "identity"][Math.floor(family / 6) % 6],
            offer: ["none", "bundle", "discount", "subscription", "trial", "guarantee"][Math.floor(family / 12) % 6],
            proof: format === "testimonial" ? "testimonial" : format === "comparison" ? "comparison" : format === "creator_demo" ? "demo" : "none",
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
  let ordered = ads
    .map((a) => ({ a, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.a);
  if (images.length) {
    ordered = [...images].sort((a, b) => a.hash.localeCompare(b.hash)).map((image, i) => ({
      ...ordered[i % ordered.length], id: `visual-${i}`, tile: undefined,
      imageUrl: image.imageUrl, brand: image.brand, url: image.url,
      referenceText: image.text || "", kind: "image",
      source: "Public inspiration image / simulated research",
    }));
  }
  const creativeNotes = {
    creator_demo: ["Show the product in use before explaining it.", "Name the frustrating step it replaces.", "Finish with a simple product introduction."],
    comparison: ["Open with two alternatives side by side.", "Compare one specific step, not every feature.", "Give the viewer a clear reason to choose."],
    testimonial: ["Lead with a specific customer situation.", "Use a supported customer quote.", "Show how the product fits into their routine."],
    graphic: ["Make one message readable immediately.", "Show the product next to the main promise.", "Keep the offer and action easy to find."],
    product: ["Start on the product and its use case.", "Show one detail that answers an objection.", "Close on the next step, without adding claims."],
    founder: ["Name the problem that led to the product.", "Explain one deliberate product choice.", "Invite viewers to see if it fits their routine."],
  };
  const briefHooks = {
    creator_demo: "Your shower shelf called. It wants some space back.",
    comparison: "Two routines. One crowded shelf. Which earns its place?",
    testimonial: "My routine was complicated before my day even started.",
    graphic: "A simpler routine starts with fewer decisions.",
    product: "Meet the essentials for your next wash day.",
    founder: "We started with one question: why so many steps?",
  };
  const briefs = Array.from({ length: 24 }, (_, i) => {
    // Every format has linked briefs, so filtering remains useful.
    const format = formats[i % formats.length];
    const formatSources = ordered.filter(a => a.labels.format.value === format);
    const matched = formatSources.filter(a => a.labels.hook.value === hooks[Math.floor(i / formats.length) % hooks.length]);
    const sources = matched.length ? matched : formatSources;
    const a = sources[(i * 13) % sources.length] || ordered[i % ordered.length];
    return {
      title: format.replaceAll("_", " "),
      hook: briefHooks[format],
      beats: creativeNotes[format],
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
  for (const ad of ordered) ad.sampleBeats = creativeNotes[ad.labels.format.value];
  return { ads: ordered, briefs };
}
