import { ageDays, summarize, title } from './core.mjs';

export function patternExamples(ads, dimension, key, { olderOnly = false, sort = 'distinct' } = {}) {
  const rows = ads.filter(a => a.status === 'complete' && (!key || a.labels?.[dimension]?.value === key)
    && (!olderOnly || (a.active === true && ageDays(a) !== null && ageDays(a) >= 60)));
  rows.sort((a, b) => {
    const aa = ageDays(a), bb = ageDays(b);
    if (aa === null || bb === null) return aa === bb ? a.id.localeCompare(b.id) : aa === null ? 1 : -1;
    return (sort === 'newest' ? aa - bb : bb - aa) || a.id.localeCompare(b.id);
  });
  if (sort !== 'distinct') return rows;
  const seen = new Set(), first = [], repeats = [];
  for (const ad of rows) {
    const family = ad.family || ad.id;
    if (seen.has(family)) repeats.push(ad);
    else { seen.add(family); first.push(ad); }
  }
  return [...first, ...repeats];
}

// These sections preserve saved words. They are reading aids based on text
// boundaries, not new model annotations or an inferred video transcript.
export function copyBreakdown(ad) {
  const speech = Boolean(ad.transcript?.trim());
  const text = String(speech ? ad.transcript : ad.text || '').trim();
  if (!text) return { source: 'No saved text', text: '', sections: [] };
  const boundary = /[!?](?=\s|$)|\.(?=\s+[A-Z]|$)|\n\s*\n/.exec(text);
  const hookEnd = boundary ? boundary.index + boundary[0].length : text.length;
  const ctaPattern = /(^|\n\s*\n|[.!?]\s+)[\p{P}\p{S}\s]*(?:click|tap|download|book|register|sign\s?up|join|grab|get started|claim|apply|learn more|watch|visit|shop|buy|message|comment)\b/giu;
  let ctaStart = text.length;
  for (const match of text.matchAll(ctaPattern)) {
    const start = match.index + match[1].length;
    if (start >= hookEnd) { ctaStart = start; break; }
  }
  const sections = [
    { role: 'Opening', text: text.slice(0, hookEnd).trim() },
    { role: 'Body', text: text.slice(hookEnd, ctaStart).trim() },
    { role: 'Close / call to action', text: text.slice(ctaStart).trim() },
  ].filter(section => section.text);
  return { source: speech ? 'Speech transcript' : 'Saved ad copy', text, sections };
}

const tests = {
  talking_head: 'Open with one specific business problem, teach one actionable step and end with a relevant next step.',
  free_resource: 'Offer one useful framework or guide for a clearly named problem. State what people receive and how to get it.',
  workshop: 'Name who the event is for, the skill they will practice and the actual registration step.',
  course: 'Explain the skill and audience clearly. Use supported course details and a clear next step.',
  creator_demo: 'Show the product solving one frustrating step in the first shot. Explain it after the demonstration.',
  comparison: 'Put two routines side by side. Compare one useful difference, then make the choice easy.',
  testimonial: 'Start with a specific customer situation. Use a real, supported quote and show the routine behind it.',
  founder: 'Explain the problem that made you build the product. Show one choice you made differently.',
  graphic: 'Make one benefit readable at a glance. Keep the product and next step in the same frame.',
  product: 'Show the product in context. Answer one objection instead of listing every feature.',
  frustration: 'Open on a problem your customer already recognizes, then show the step that changes it.',
  curiosity: 'Ask a specific unanswered question, then show the answer in the creative.',
  contradiction: 'Challenge one familiar assumption and demonstrate the alternative.',
  result: 'Name a specific outcome you can support and show what the product actually does.',
  direct: 'Introduce the product and the use case clearly, then show it in action.',
  offer: 'State the actual deal early and keep the conditions readable.',
  bundle: 'Explain why the items belong together. Test the routine as the offer, not just the discount.',
  discount: 'Test the deal against a version led by the customer problem, using the same product and audience.',
  none: 'Test a product demonstration without a promotional lead. Keep a clear next step.',
  trial: 'Lead with a low-commitment way to try the product. State the actual sample price and conditions clearly.',
  subscription: 'Explain what arrives, how often and how to cancel. Test convenience against a price-led version.',
  guarantee: 'Show the exact guarantee and its conditions. Test whether addressing the objection helps your own campaign.',
};

// All figures are derived from the current dataset, including the demo fixture.
export function researchFindings(ads) {
  const dated = ads.filter(a => a.status === 'complete' && a.active === true && ageDays(a) !== null);
  const baseline = dated.length ? dated.filter(a => ageDays(a) >= 60).length / dated.length : null;
  const minimumGroupSize = Math.max(5, Math.ceil(dated.length * .02));
  return ['format', 'hook', 'offer'].map(dimension => {
    const ranked = summarize(ads, dimension);
    const row = ranked.find(r => r.dated >= minimumGroupSize && r.key !== 'unknown');
    if (!row) return null;
    const examples = patternExamples(ads, dimension, row.key);
    const older = examples.filter(a => a.active === true && ageDays(a) !== null && ageDays(a) >= 60);
    const facets = (dimension === 'format' ? ['hook', 'offer'] : ['format', 'proof']).map(key => {
      const counts = new Map();
      for (const ad of older) { const value = ad.labels?.[key]?.value; if (value && value !== 'unknown') counts.set(value, (counts.get(value) || 0) + 1); }
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return top ? { dimension: key, key: top[0], n: top[1], total: older.length } : null;
    }).filter(Boolean);
    const comparison = ranked.filter(r => r.key !== row.key && r.key !== 'unknown' && r.dated >= minimumGroupSize).sort((a,b)=>b.n-a.n)[0] || null;
    return {
      ...row, dimension, baseline, minimumGroupSize, facets, comparison,
      exampleIds: examples.slice(0, 4).map(a => a.id),
      lift: baseline ? row.share / baseline : null,
      heading: `${title(row.key)} has the highest 60+ day share`,
      observation: `${row.old.toLocaleString()} of ${row.dated.toLocaleString()} dated active ads in this group started at least 60 days earlier. Median age: ${Math.round(row.medianAge)} days.`,
      nextTest: tests[row.key] || `Test an original ${title(row.key).toLowerCase()} approach using your product facts and compare it with your current creative.`,
    };
  }).filter(Boolean);
}
