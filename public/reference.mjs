// The supplied reference layout, recolored. All displayed analysis is simulated.
const blue = "#2563eb",
  ink = "#182132",
  grey = "#636b78",
  border = "#d5dbe4";
const patterns = [
  "Talking head demo",
  "Myth-buster comparison",
  "Cartoon explainer",
  "Quote static",
  "Price anchor",
  "Product still",
];
const titles = [
  "quote static",
  "cartoon explainer",
  "price anchor",
  "myth-buster comparison",
  "talking head demo",
  "product still",
];
const copy = [
  "“Covered my gray completely, and my hair feels healthier.”",
  "“Ammonia walks into a bathroom.”",
  "“17 shades. One price. $12.98.”",
  "“Read the label. Then read ours.”",
  "“I stopped paying $180 to hide two inches of roots.”",
  "“Your daily essentials. Nothing extra.”",
];
const score = [86, 79, 81, 85, 94, 76];
const multiples = [1.9, 2.4, 2.3, 1.55, 1.4, 0.3];
const variation = [0.12, 0.12, 0.12, 0.17, 0.12, 0.11];
const stripSpeed = [61, 24, 48, 18, 67, 29];
const days = [96, 89, 126, 74, 62, 19];
const metaIcon = new Image();
metaIcon.src = new URL("./assets/meta.svg", import.meta.url).href;
await metaIcon.decode();
// Derive every moving field from the playback clock so scrubbing and pausing
// preserve one coherent frame. The source varies multiples, not the day counts.
function movingValue(t, seed, base, spread) {
  return base + spread * (0.7 * Math.sin(t * 2.1 + seed * 1.7) +
    0.3 * Math.sin(t * 3.7 + seed * 2.3));
}
// A tile's center crossing the scan edge is the only processing event.
// Row offsets stagger those events, rather than incrementing four at once.
const wallStep = 130;
function wallTravel(t) {
  return 520 * t + 40 * (1 - Math.cos(t * 2));
}
function scannedAt(t, total) {
  const travel = wallTravel(Math.max(0, t));
  let scanned = 0;
  for (let row = 0; row < 4; row++) {
    const phase = row * wallStep / 4;
    // The first unprocessed tile starts with its center at 497.5; edge = 496.
    scanned += Math.floor((travel + phase - 1.5) / wallStep) -
      Math.floor((phase - 1.5) / wallStep);
  }
  return Math.min(total, scanned);
}
export function drawReference({
  ctx,
  art,
  requestImage,
  text,
  rect,
  stroke,
  dot,
  rule,
  wrap,
  clamp,
  ease,
  smooth,
  rnd,
  fmt,
  total,
  p,
  t,
  duration,
}) {
  const travel = wallTravel(t),
    scanned = scannedAt(t, total),
    scanRate = scanned - scannedAt(t - 1, total),
    demoCost = scanned * 0.0004,
    briefs = Math.floor(scanned / 12),
    briefRate = briefs - Math.floor(scannedAt(t - 1, total) / 12),
    scanProgress = scanned === 0 ? 0 : Math.min(total, 1 + (travel - 1.5) / (wallStep / 4));
  rect(0, 0, 2048, 1128, "#f7f8fa");
  rect(50, 26, 13, 13, blue);
  text("Jev for Meta Ads", 80, 42, 26, ink, 650);
  text(
    "Scans the Meta Ad Library, finds long-running patterns, then helps write your next ad brief.",
    322,
    39,
    17,
    grey,
  );
  ctx.drawImage(metaIcon, 1490, 18, 30, 30);
  text("Meta Ads", 1527, 39, 20, ink, 600);
  rect(1616, 21, 1, 23, border);
  dot(1655, 33, 3, blue);
  text(
    `Simulated run · ${t.toFixed(1)}s elapsed · $${demoCost.toFixed(2)} demo cost`,
    1670,
    39,
    14,
    grey,
  );
  rule(50, 63, 1968, border);
  rect(689, 88, 1, 1022, border);
  rect(1380, 88, 1, 1022, border);
  const section = (num, label, x) => {
    text(num, x, 114, 15, blue, 600, true);
    text(label, x + 32, 113, 24, ink, 600);
  };
  section("01", "Jev scans the Ad Library", 50);
  section("02", "Jev analyses the longest running ads", 740);
  section("03", "Jev helps write briefs for winning ads", 1428);
  const stat = (x, w, value, color, label, sub) => {
    rect(x, 139, w, 92, "#ffffff");
    stroke(x, 139, w, 92, border);
    const rightX = x + 155,
      rightWidth = w - 171,
      valueWidth = rightX - x - 28;
    let valueSize = 46;
    ctx.font = `600 ${valueSize}px "Avenir Next", "Helvetica Neue", sans-serif`;
    while (ctx.measureText(value).width > valueWidth && valueSize > 28) {
      valueSize--;
      ctx.font = `600 ${valueSize}px "Avenir Next", "Helvetica Neue", sans-serif`;
    }
    text(value, x + 16, 201, valueSize, color, 600);
    if (Array.isArray(label))
      label.forEach((line, i) => text(line, rightX, 169 + i * 21, 16, grey));
    else wrap(label, rightX, 169, rightWidth, 16, grey, 400, 2);
    if (sub) {
      let subSize = 15;
      ctx.font = `400 ${subSize}px "Avenir Next", "Helvetica Neue", sans-serif`;
      while (ctx.measureText(sub).width > rightWidth && subSize > 11) {
        subSize--;
        ctx.font = `400 ${subSize}px "Avenir Next", "Helvetica Neue", sans-serif`;
      }
      text(sub, rightX, 215, subSize, grey);
    }
    return { rightX, rightWidth };
  };
  const scannedCard = stat(50, 289, fmt(scanned), ink, "ads scanned");
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 14; col++) {
      const lit = rnd(col + row * 17 + scanned) > 0.56;
      rect(scannedCard.rightX + col * 8, 185 + row * 7, 5, 5, lit ? blue : "#e2e7ef");
    }
  const rateCard = stat(348, 289, String(scanRate), blue, ["ads read", "per second"]);
  rect(rateCard.rightX, 209, rateCard.rightWidth, 9, "#e2e7ef");
  rect(rateCard.rightX, 209, rateCard.rightWidth * clamp(scanRate / 20), 9, blue);
  stat(740, 289, fmt(scanned * 3), blue, "judgments", "3 per ad");
  stat(
    1039,
    289,
    "$" + demoCost.toFixed(2),
    ink,
    "demo cost",
    "$0.0004 per ad",
  );
  stat(1428, 289, fmt(briefs * 3), blue, "scores given", "hook, fit, survival");
  stat(1728, 290, fmt(briefs), blue, "ad briefs written", `${briefRate} per second`);
  // A horizontal feed behind the stationary scoring edge, like the reference.
  ctx.save();
  ctx.beginPath();
  ctx.rect(50, 246, 588, 864);
  ctx.clip();
  const tw = 115,
    th = 184,
    step = wallStep,
    scanX = 496;
  for (let row = 0; row < 4; row++) {
    const start = Math.floor((travel + row * step / 4) / step);
    for (let ahead = 6; ahead < 9; ahead++)
      requestImage(80 + (start + ahead) * 4 + row);
  }
  for (let row = 0; row < 4; row++) {
    const rowTravel = travel + row * step / 4,
      offset = rowTravel % step,
      start = Math.floor(rowTravel / step);
    for (let col = -1; col < 6; col++) {
      const x = 50 + col * step - offset,
        y = 246 + row * 220,
        n = 80 + (start + col) * 4 + row;
      const dim = x + tw / 2 > scanX;
      ctx.save();
      if (dim) ctx.filter = "grayscale(1)";
      art(n, x, y, tw, th);
      ctx.restore();
      const selected = !dim && rnd(n + 44) > 0.56;
      if (dim) rect(x, y, tw, th, "#f7f8fa88");
      if (selected) stroke(x + 1, y + 1, tw - 2, th - 2, blue);
      if (rnd(n + 4) > 0.69) {
        rect(x + tw - 30, y + 6, 26, 21, "#09090bd9");
        text(
          "×" + (2 + Math.floor(rnd(n) * 5)),
          x + tw - 27,
          y + 21,
          14,
          "#ffffff",
          500,
        );
      }
      if (row === 2 && col === 0) {
        rect(x + 3, y + th - 31, tw - 6, 27, "#182b52d9");
        text("● video", x + 10, y + th - 11, 13, "#ffffff");
      }
      text(
        `${Math.floor(rnd(n + 91) * 166) + 4}d`,
        x + 5,
        y + th + 20,
        15,
        dim ? "#77787d" : ink,
      );
    }
  }
  rect(scanX, 243, 2, 866, blue);
  text("scoring", scanX + 10, 258, 17, blue, 500, true);
  ctx.restore();
  // Dense cloud, stable axes and a bounded region for the 60+ day examples.
  const gx = 763,
    gy = 271,
    gw = 563,
    gh = 286,
    cut = gx + 180;
  rule(gx, gy, gw, "#dfe4ec");
  rule(gx, gy + gh, gw, "#dfe4ec");
  rect(cut, 252, gw - 180, 302, "#2563eb08");
  stroke(cut, 252, gw - 180, 302, "#9bb6ef");
  let longRunning = 0;
  for (let i = 0; i < scanned; i++)
    if (gx + Math.pow(rnd(i + 510), 2.1) * gw > cut) longRunning++;
  text(`60+ days · ${fmt(longRunning)} ads`, cut + 210, 278, 19, blue, 600);
  ctx.save();
  ctx.translate(749, 442);
  ctx.rotate(-Math.PI / 2);
  text("Variants", 0, 0, 16, grey);
  ctx.restore();
  text("Days live", 1006, 576, 17, grey);
  for (let i = 0; i < scanned; i++) {
    const a = ease((scanned - i) / 8),
      xx = gx + Math.pow(rnd(i + 510), 2.1) * gw,
      yy =
        gy +
        gh -
        (i % 9 === 0 ? 0.135 : Math.pow(rnd(i + 2100), xx > cut ? 1.5 : 2.6)) *
          gh;
    const highlight = xx > cut;
    const activity = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.93);
    ctx.save();
    ctx.globalAlpha = (0.45 + 0.5 * a) * (0.76 + activity * 0.24);
    dot(
      xx,
      yy + 8 * (1 - a),
      ((highlight ? 2.8 : 1.4) + rnd(i + 300) * 2.5 * a) *
        (0.88 + activity * 0.12),
      highlight ? blue : "#8994a6",
    );
    ctx.restore();
  }
  // Each example strip advances independently, as in the supplied clip.
  text("Pattern", 740, 650, 17, grey);
  text("Their ads", 910, 650, 17, grey);
  text("60d vs average", 1118, 650, 17, grey);
  text("Days", 1281, 650, 17, grey);
  rule(740, 665, 588, border);
  for (let i = 0; i < 6; i++) {
    const y = 680 + i * 70;
    wrap(patterns[i], 740, y + 25, 158, 17, ink, 550, 2);
    const distance = t * stripSpeed[i],
      firstThumb = Math.floor(distance / 50),
      thumbOffset = distance % 50;
    for (let j = 0; j < 9; j++) requestImage(45 + i * 139 + firstThumb + j);
    ctx.save();
    ctx.beginPath();
    ctx.rect(911, y - 5, 198, 59);
    ctx.clip();
    for (let j = 0; j < 5; j++)
      art(45 + i * 139 + firstThumb + j, 911 + j * 50 - thumbOffset, y - 5, 48, 59);
    ctx.restore();
    const multiple = movingValue(t, i, multiples[i], variation[i]);
    const c = i === 5 ? "#d94361" : blue,
      ww = 65;
    rect(1118, y + 15, ww, 12, "#e2e7ef");
    rect(1118, y + 15, ww * clamp(multiple / 2.6) * ease(p * 2), 12, c);
    text(multiple.toFixed(1) + "×", 1212, y + 31, 24, c, 600);
    text(days[i] + "d", 1285, y + 28, 17, grey);
    rule(740, y + 53, 588, border);
  }
  // A slowly moving brief list, with the score column in exactly the reference position.
  ctx.save();
  ctx.beginPath();
  ctx.rect(1428, 246, 590, 865);
  ctx.clip();
  const stepBrief = 170,
    travelBrief = Math.max(0, scanProgress / 12 - 6) * stepBrief,
    first = Math.floor(travelBrief / stepBrief),
    offsetBrief = travelBrief % stepBrief;
  for (let row = -1; row < 7; row++) {
    const i = first + row,
      k = ((i % 6) + 6) % 6,
      y = 246 + row * stepBrief - offsetBrief;
    if (i < 0 || i >= briefs) continue;
    rect(1428, y, 590, 158, "#ffffff");
    stroke(1428, y, 590, 158, border);
    text(
      `Brief ${String(i + 1).padStart(2, "0")} · ${titles[k]}`,
      1445,
      y + 24,
      16,
      blue,
      500,
      true,
    );
    wrap(copy[k], 1445, y + 50, 349, 19, ink, 550, 2);
    text("modelled on", 1445, y + 125, 16, grey);
    art(45 + k * 29, 1552, y + 93, 44, 51);
    art(46 + k * 29, 1599, y + 93, 44, 51);
    text(
      score[k],
      1820,
      y + 43,
      42,
      k === 0 || k === 3 || k === 4 ? blue : ink,
      600,
    );
    for (let j = 0; j < 3; j++) {
      const yy = y + 76 + j * 30;
      const s = [score[k], score[k] - 3, score[k] + 2][j];
      text(["Hook", "Brand fit", "Survival"][j], 1820, yy, 17, grey);
      rect(1928, yy - 9, 72, 7, "#e2e7ef");
      rect(
        1928,
        yy - 9,
        ((72 * s) / 100) * ease(p * 4),
        7,
        k === 0 || k === 3 || k === 4 ? blue : "#52627a",
      );
    }
  }
  ctx.restore();
  // The two small, circular handoff markers sit on the column dividers.
  for (const x of [689, 1380]) {
    dot(x, 600, 24, blue);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 5, 591);
    ctx.lineTo(x + 5, 600);
    ctx.lineTo(x - 5, 609);
    ctx.stroke();
  }
}
