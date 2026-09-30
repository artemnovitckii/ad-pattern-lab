import { drawReference } from "./reference.mjs";
const $ = (s) => document.querySelector(s);
const canvas = $("#canvas"),
  ctx = canvas.getContext("2d", { alpha: false });
const params = new URLSearchParams(location.search);
const valid = ["reference", "control", "flow", "scanner"];
let variant = valid.includes(params.get("variant"))
  ? params.get("variant")
  : "reference";
let portrait = params.get("format") === "portrait";
let duration = [20, 40, 80].includes(Number(params.get("duration")))
  ? Number(params.get("duration"))
  : 20;
let elapsed = 0,
  playing = false,
  ready = false,
  last = 0,
  W = 1440,
  H = 1000;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ink = "#eff1e8",
  muted = "#8d9688",
  lime = "#dafa72",
  line = "#2a3228",
  bg = "#080c09";
const palette = [lime, "#83c5b0", "#a6afe1", "#ddb893", "#d5d7c8", "#a7c581"];
const names = [
  "Problem → solution",
  "Show the product",
  "Customer proof",
  "The comparison",
  "Make an offer",
  "A fresh perspective",
];
const hooks = [
  "Start with the problem.",
  "Show it. Then explain it.",
  "Let the customer open.",
  "Make the difference visible.",
  "One offer. One next step.",
  "Challenge the default.",
];
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const ease = (n) => 1 - Math.pow(1 - clamp(n), 3);
const smooth = (n) => {
  n = clamp(n);
  return n * n * (3 - 2 * n);
};
const mix = (a, b, p) => a + (b - a) * p;
const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
let images = [];
let atlas = null;
try {
  const r = await fetch("/api/demo-library");
  if (r.ok) images = (await r.json()).images || [];
} catch {}
images.sort((a, b) => String(a.hash).localeCompare(String(b.hash)));
const total = images.length || 1599;
const cache = new Map(),
  jobs = [],
  queued = new Set();
let workers = 0,
  tick = 0;
function imageIndex(n) {
  return (((Math.floor(n) * 37) % total) + total) % total;
}
function requestImage(n) {
  if (!images.length) return;
  const i = imageIndex(n);
  if (cache.has(i)) {
    cache.get(i).used = tick;
    return;
  }
  if (!queued.has(i)) {
    queued.add(i);
    jobs.push(i);
    pump();
  }
}
function pump() {
  while (workers < 6 && jobs.length) {
    const i = jobs.shift();
    workers++;
    const img = new Image();
    img.decoding = "async";
    img.src = images[i].imageUrl;
    img
      .decode()
      .then(() => {
        cache.set(i, { img, used: tick });
        if (ready && !playing) requestAnimationFrame(draw);
        if (cache.size > 260) {
          const oldest = [...cache].sort((a, b) => a[1].used - b[1].used);
          for (let k = 0; k < cache.size - 220; k++) cache.delete(oldest[k][0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        workers--;
        queued.delete(i);
        pump();
      });
  }
}
function rect(x, y, w, h, color = bg) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function stroke(x, y, w, h, color = line) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function text(s, x, y, size = 14, color = ink, weight = 400, mono = false) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${mono ? "Menlo, monospace" : '"Avenir Next", "Helvetica Neue", sans-serif'}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(s), x, y);
}
function rule(x, y, w, color = line) {
  rect(x, y, w, 1, color);
}
function wrap(s, x, y, width, size = 22, color = ink, weight = 500, max = 3) {
  const words = s.split(" ");
  let str = "",
    row = 0;
  ctx.font = `${weight} ${size}px "Avenir Next", sans-serif`;
  for (const word of words) {
    const next = str ? str + " " + word : word;
    if (ctx.measureText(next).width > width && str) {
      text(str, x, y + row * size * 1.32, size, color, weight);
      row++;
      str = word;
      if (row >= max) return;
    } else str = next;
  }
  text(str, x, y + row * size * 1.32, size, color, weight);
}
function dot(x, y, r, color = lime) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function art(n, x, y, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  rect(x, y, w, h, "#1b231c");
  let img;
  if (images.length) {
    requestImage(n);
    const c = cache.get(imageIndex(n));
    if (c) {
      c.used = tick;
      img = c.img;
    }
  }
  if (img) {
    const scale = Math.max(w / img.width, h / img.height);
    ctx.drawImage(
      img,
      x + (w - img.width * scale) / 2,
      y + (h - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
  } else if (atlas) {
    const tile = ((n % 16) + 16) % 16,
      sw = atlas.width / 4,
      sh = atlas.height / 4;
    ctx.drawImage(
      atlas,
      (tile % 4) * sw,
      Math.floor(tile / 4) * sh,
      sw,
      sh,
      x,
      y,
      w,
      h,
    );
  } else {
    rect(x + 9, y + h - 24, w - 18, 2, "#374333");
  }
  ctx.restore();
}
function label(s, x, y, w = 170) {
  rect(x, y, w, 27, "#0a100cdd");
  ctx.font = "500 11px Menlo, monospace";
  let v = s;
  while (v.length > 1 && ctx.measureText(v + "…").width > w - 18)
    v = v.slice(0, -1);
  text(v === s ? s : v + "…", x + 9, y + 18, 11, lime, 500, true);
}
function heading(n, s, x, y) {
  text(n, x, y, 13, lime, 600, true);
  text(s, x + 35, y, 24, ink, 600);
}
function counter(n, labelText, x, y, w = 180) {
  text(fmt(n), x, y, 48, ink, 600);
  text(labelText, x, y + 26, 12, muted, 400, true);
}
function header() {
  rect(0, 0, W, H, bg);
  rect(28, 31, 12, 12, lime);
  text("Jev / ad research", 52, 44, 22, ink, 650);
  text("SIMULATION", W - 205, 42, 11, lime, 500, true);
  text(
    `${elapsed.toFixed(1).padStart(4, "0")}s`,
    W - 88,
    44,
    16,
    ink,
    500,
    true,
  );
  rule(28, 70, W - 56);
}
function footer() {
  rule(28, H - 45, W - 56);
  text(
    "PUBLIC CREATIVE IMAGES · SIMULATED LABELS, DATES & SCORES",
    28,
    H - 22,
    10,
    muted,
    400,
    true,
  );
  const v = {
    control: "01 / CONTROL ROOM",
    flow: "02 / CREATIVE STREAM",
    scanner: "03 / UNDER THE LENS",
  };
  text(v[variant], W - 236, H - 22, 10, lime, 500, true);
}
// Each column has persistent spatial order. Only the offscreen rows are recycled.
function wall(x, y, w, h, t, cols = 4, speed = 78) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const gap = 9,
    cw = (w - gap * (cols - 1)) / cols,
    ch = cw * 1.43,
    step = ch + gap;
  for (let c = 0; c < cols; c++) {
    const travel = t * speed * (c % 2 ? 0.83 : 1) + c * step * 0.3,
      first = Math.floor(travel / step),
      offset = travel % step;
    for (let row = -1; row < Math.ceil(h / step) + 1; row++) {
      const n = (first + row + 4) * cols + c;
      const yy = y + row * step - offset;
      art(n, x + c * (cw + gap), yy, cw, ch);
      stroke(x + c * (cw + gap), yy, cw, ch, "#35402f");
      if (cw > 90) {
        label(
          names[n % 6].split(" →")[0],
          x + c * (cw + gap) + 5,
          yy + ch - 28,
          Math.min(cw - 10, 140),
        );
      }
    }
    for (let k = 0; k < 5; k++)
      requestImage((first + Math.ceil(h / step) + k + 4) * cols + c);
  }
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#080c09cc");
  grad.addColorStop(0.1, "#080c0900");
  grad.addColorStop(0.88, "#080c0900");
  grad.addColorStop(1, bg);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  // A single slow sweep, not a flashing full-wall highlight.
  const sy = y + h * (0.18 + 0.64 * ((t * 0.18) % 1));
  rect(x, sy, w, 1, "#dafa7266");
  ctx.restore();
}
const points = Array.from({ length: 220 }, (_, i) => ({
  x: 0.03 + Math.pow(rnd(i + 1), 0.78) * 0.94,
  y: 0.03 + Math.pow(rnd(i + 490), 2) * 0.9,
  birth: (i / 220) * 0.88,
  group: i % 6,
  n: 150 + i * 3,
}));
function graph(x, y, w, h, p, t, { thumbs = false, from = null } = {}) {
  const l = 34,
    r = 12,
    top = 28,
    bot = 32,
    gw = w - l - r,
    gh = h - top - bot;
  const px = (v) => x + l + v * gw,
    py = (v) => y + top + (1 - v) * gh;
  text("OBSERVED VARIANTS ↑", x + l, y + 12, 10, muted, 400, true);
  rect(px(0.25), y + top, gw * 0.75, gh, "#dafa7205");
  for (let j = 0; j <= 4; j++) {
    rule(x + l, py(j / 4), gw, "#263025");
    text(String(j * 8), x + 4, py(j / 4) + 4, 10, muted, 400, true);
    text(`${j * 60}d`, px(j / 4) - 10, y + h - 10, 10, muted, 400, true);
  }
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = "#6d8048";
  ctx.beginPath();
  ctx.moveTo(px(0.25), y + top);
  ctx.lineTo(px(0.25), y + top + gh);
  ctx.stroke();
  ctx.restore();
  text("60 DAYS", px(0.25) + 8, y + 43, 10, lime, 400, true);
  let count = 0;
  for (const pt of points) {
    const age = (p - pt.birth) * duration;
    if (thumbs && age > -3 && age < 2.4) requestImage(pt.n);
    if (age < 0) continue;
    count++;
    const a = ease(age / 0.85),
      tx = px(pt.x),
      ty = py(pt.y);
    let dx = tx,
      dy = mix(ty + 18, ty, a);
    if (from && age < 1.25) {
      const q = smooth(age / 1.25);
      dx = mix(from[0], tx, q);
      dy = mix(from[1], ty, q) - Math.sin(q * Math.PI) * 95;
      ctx.save();
      ctx.globalAlpha = 0.15 * (1 - q);
      ctx.strokeStyle = palette[pt.group];
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.quadraticCurveTo(
        (from[0] + tx) / 2,
        Math.min(from[1], ty) - 90,
        tx,
        ty,
      );
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    const color = pt.x > 0.25 ? palette[pt.group] : muted;
    if (thumbs && age < 2.4) {
      const s = mix(48, 10, smooth(age / 2.4));
      art(pt.n, dx - s / 2, dy - s / 2, s, s);
      stroke(dx - s / 2, dy - s / 2, s, s, color);
    } else dot(dx, dy, 2.5 + pt.y * 3.5, color);
    ctx.restore();
  }
  text(
    "DAYS SINCE REPORTED START →",
    x + w - 250,
    y + h + 13,
    10,
    muted,
    400,
    true,
  );
  return count;
}
function patterns(x, y, w, p, rows = 4) {
  text("ILLUSTRATIVE PATTERNS", x, y, 11, muted, 500, true);
  text("60+ DAYS", x + w - 87, y, 10, muted, 400, true);
  for (let i = 0; i < rows; i++) {
    const yy = y + 32 + i * 48,
      share = [0.86, 0.77, 0.71, 0.63, 0.58, 0.49][i] * ease(p * 2.1);
    text(names[i], x, yy, 14, ink, 500);
    rect(x + w * 0.59, yy - 9, w * 0.24, 4, "#283123");
    rect(x + w * 0.59, yy - 9, w * 0.24 * share, 4, palette[i]);
    text(
      `${Math.round(share * 100)}%`,
      x + w - 45,
      yy + 1,
      16,
      palette[i],
      500,
      true,
    );
    rule(x, yy + 17, w);
  }
}
function briefCard(x, y, w, h, i, p = 1) {
  const k = ((i % 6) + 6) % 6;
  rect(x, y, w, h, "#111a11");
  stroke(x, y, w, h, "#34402b");
  text(
    `BRIEF ${String(i + 1).padStart(2, "0")} / ${names[k].toUpperCase()}`,
    x + 18,
    y + 27,
    10,
    lime,
    500,
    true,
  );
  wrap(hooks[k], x + 18, y + 59, w - 36, w > 380 ? 27 : 22, ink, 550, 2);
  const iy = y + h - 64;
  art(150 + i * 3, x + 18, iy, 34, 43);
  text("Example concept", x + 63, iy + 15, 11, muted);
  text("Simulated review", x + 63, iy + 32, 10, muted);
  const bx = x + w * 0.65;
  for (let j = 0; j < 3; j++) {
    rect(bx, iy + 5 + j * 13, w * 0.2, 3, "#303b28");
    rect(bx, iy + 5 + j * 13, w * 0.2 * (0.7 + rnd(i + j) * 0.25) * p, 3, lime);
  }
}
function briefFeed(x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const ch = 194,
    gap = 14,
    phase = Math.max(0, t - 1.8) / 3.2,
    index = Math.floor(phase),
    offset = smooth(phase - index) * 28;
  // Stable cards drift together; the next card enters from below.
  for (let j = -1; j < 4; j++) {
    const k = index + j;
    if (k < 0) continue;
    const yy =
      y + (j + 1) * (ch + gap) - offset - (phase - index) * (ch + gap - 28);
    ctx.save();
    ctx.globalAlpha = clamp((t - 0.8) / 1);
    briefCard(x, yy, w, ch, k);
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#080c0900");
  g.addColorStop(0.82, "#080c0900");
  g.addColorStop(1, bg);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
function control(p, t) {
  if (!portrait) {
    const x1 = 28,
      x2 = 504,
      x3 = 990,
      cw = 444;
    heading("01", "Read the creative.", x1, 116);
    heading("02", "Find the patterns.", x2, 116);
    heading("03", "Make it your own.", x3, 116);
    counter(total * p, "creative images", x1, 184);
    counter(total * p * 7, "typed decisions", x1 + 233, 184);
    wall(x1, 235, cw, 650, t, 4, 88);
    counter(
      Math.min(220, Math.floor((p / 0.88) * 220) + 1),
      "pattern families",
      x2,
      184,
    );
    text("SIMULATED", x2 + 266, 180, 22, lime, 500, true);
    graph(x2, 242, cw, 378, p, t);
    patterns(x2, 678, cw, p, 5);
    briefFeed(x3, 151, W - x3 - 28, 748, t);
    rect(482, 99, 1, H - 167, line);
    rect(968, 99, 1, H - 167, line);
  } else {
    heading("01", "Read the creative.", 28, 116);
    heading("02", "Find the patterns.", 548, 116);
    counter(total * p, "creative images", 28, 189);
    counter(total * p * 7, "typed decisions", 275, 189);
    wall(28, 242, 484, 665, t, 4, 80);
    graph(540, 170, 510, 421, p, t);
    patterns(556, 659, 480, p, 5);
    heading("03", "Make it your own.", 28, 953);
    briefCard(28, 983, 496, 240, Math.floor(t / 3));
    briefCard(548, 983, 504, 240, Math.floor(t / 3) + 1);
  }
}
function flow(p, t) {
  const wallW = portrait ? 300 : 370,
    gx = wallW + 64,
    gw = W - gx - 28,
    gy = portrait ? 273 : 245,
    gh = portrait ? 605 : 490;
  text("From a thousand ads", 28, 130, portrait ? 48 : 56, ink, 550);
  text("to your next idea.", 28, 193, portrait ? 48 : 56, lime, 550);
  text(
    "A LIVE VISUALIZATION / SIMULATED RESEARCH",
    W - 411,
    108,
    10,
    muted,
    500,
    true,
  );
  wall(28, 250, wallW, portrait ? 638 : 505, t, 3, 115);
  graph(gx, gy, gw, gh, p, t, {
    thumbs: true,
    from: [wallW + 40, gy + gh * 0.5],
  });
  text(fmt(total * p), W - 320, 185, 42, lime, 550);
  text("CREATIVE IMAGES", W - 161, 183, 10, muted, 500, true);
  const by = portrait ? 946 : 789,
    bw = (W - 80) / 2;
  heading("↳", "The research becomes a brief.", 28, by - 24);
  briefCard(28, by, bw, portrait ? 281 : 153, Math.floor(t / 4));
  briefCard(52 + bw, by, bw, portrait ? 281 : 153, Math.floor(t / 4) + 1);
}
function scanner(p, t) {
  const stripY = 91,
    stripH = portrait ? 146 : 105,
    cw = stripH * 0.75,
    step = cw + 8,
    travel = t * 92,
    first = Math.floor(travel / step),
    offset = travel % step;
  ctx.save();
  ctx.beginPath();
  ctx.rect(28, stripY, W - 56, stripH);
  ctx.clip();
  for (let i = -1; i < Math.ceil(W / step) + 1; i++)
    art(first + i + 40, 28 + i * step - offset, stripY, cw, stripH);
  ctx.restore();
  const top = portrait ? 281 : 234,
    heroW = portrait ? 335 : 294,
    heroH = portrait ? 416 : 360,
    cycle = t / 2.8,
    idx = Math.floor(cycle),
    q = cycle - idx,
    transition = smooth(q / 0.22);
  text("UNDER THE LENS", 28, top - 19, 11, lime, 600, true);
  art(340 + idx, 28, top, heroW, heroH);
  if (q < 0.22 && idx > 0)
    art(339 + idx, 28, top, heroW, heroH, 1 - transition);
  stroke(28, top, heroW, heroH, "#9fb75c");
  const sy = top + heroH * smooth(q);
  rect(28, sy, heroW, 2, lime);
  const scan = ctx.createLinearGradient(0, sy - 45, 0, sy);
  scan.addColorStop(0, "#dafa7200");
  scan.addColorStop(1, "#dafa7226");
  ctx.fillStyle = scan;
  ctx.fillRect(28, sy - 45, heroW, 45);
  const dx = heroW + 67,
    dw = portrait ? W - dx - 28 : 460;
  text("One creative.", dx, top + 45, 42, ink, 550);
  text("Seven decisions.", dx, top + 96, 42, lime, 550);
  const fields = [
      "HOOK",
      "FORMAT",
      "ANGLE",
      "OFFER",
      "PROOF",
      "OBJECTION",
      "CTA",
    ],
    values = [
      [
        "Problem first",
        "Static creative",
        "Convenience",
        "Product bundle",
        "Customer quote",
        "Time",
        "Shop now",
      ],
      [
        "Curiosity",
        "Comparison",
        "Simplicity",
        "Intro offer",
        "Demonstration",
        "Complexity",
        "Learn more",
      ],
      [
        "Direct offer",
        "Product still",
        "Value",
        "Two-pack",
        "Product detail",
        "Price",
        "Explore the range",
      ],
    ][idx % 3];
  fields.forEach((f, i) => {
    const yy = top + 140 + i * 31,
      a = ease((q * 2.8 - i * 0.1) / 0.5);
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.8 * a;
    text(f, dx, yy, 10, muted, 500, true);
    text(values[i], dx + 116, yy, 16, ink, 500);
    rect(dx + dw - 96, yy - 8, 90 * a, 3, palette[i % 6]);
    ctx.restore();
  });
  if (!portrait) {
    const bx = 885;
    heading("↳", "Creative direction", bx, top + 3);
    briefCard(bx, top + 28, W - bx - 28, 240, idx);
    counter(total * p, "creative images", bx, top + 332);
    counter(total * p * 7, "typed decisions", bx + 242, top + 332);
  }
  const gy = portrait ? 763 : 653,
    gh = portrait ? 448 : 257;
  heading("02", "The patterns build as it reads.", 28, gy - 13);
  graph(28, gy + 19, portrait ? W - 56 : 785, gh, p, t, {
    thumbs: true,
    from: [190, top + heroH],
  });
  if (!portrait) patterns(885, gy + 28, W - 913, p, 4);
  else {
    text(fmt(total * p), W - 300, gy - 16, 31, lime, 550);
    text("IMAGES", W - 132, gy - 17, 11, muted, 500, true);
  }
  for (let k = 1; k < 5; k++) requestImage(340 + idx + k);
}
function draw() {
  tick++;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  const p = clamp(elapsed / duration);
  if (variant === "reference") {
    drawReference({
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
      t: elapsed,
      duration,
    });
    return;
  }
  header();
  ({ control, flow, scanner })[variant](p, elapsed);
  footer();
}
function resize() {
  if (variant === "reference") portrait = false;
  W = variant === "reference" ? 2048 : portrait ? 1080 : 1440;
  H = variant === "reference" ? 1128 : portrait ? 1350 : 1000;
  document.body.classList.toggle("reference", variant === "reference");
  $("#format").disabled = variant === "reference";
  $("#format").value = portrait ? "portrait" : "wide";
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  canvas.style.aspectRatio = `${W}/${H}`;
  document.body.classList.toggle("portrait", portrait);
  draw();
}
function sync() {
  if (variant === "reference") portrait = false;
  const url = new URL(location.href);
  url.searchParams.set("variant", variant);
  url.searchParams.set("format", portrait ? "portrait" : "wide");
  url.searchParams.set("duration", duration);
  url.searchParams.set(
    "clean",
    document.body.classList.contains("clean") ? "1" : "0",
  );
  history.replaceState(null, "", url);
  $(".study.active")?.classList.remove("active");
  $(`[data-variant="${variant}"]`).classList.add("active");
  $("#format").value = portrait ? "portrait" : "wide";
  $("#duration").value = duration;
  $("#seek").max = duration;
  $("#end").textContent =
    `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`;
  $("#clip").href = `/assets/motion/${variant}.mp4`;
}
function setPlaying(value) {
  playing = value;
  last = performance.now();
  $("#play").textContent = playing
    ? "Ⅱ Pause"
    : elapsed >= duration
      ? "↺ Replay"
      : "▶ Play";
  ui();
}
function restart() {
  elapsed = 0;
  setPlaying(true);
  draw();
}
function ui() {
  const seconds = Math.floor(elapsed);
  $("#time").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("#seek").value = elapsed;
}
let uiTime = 0;
function frame(now) {
  if (playing && !document.hidden) {
    elapsed = Math.min(duration, elapsed + Math.min((now - last) / 1000, 0.08));
    draw();
    if (elapsed >= duration) setPlaying(false);
  }
  last = now;
  if (now - uiTime > 90) {
    ui();
    uiTime = now;
  }
  requestAnimationFrame(frame);
}
for (const a of document.querySelectorAll("[data-variant]"))
  a.onclick = (e) => {
    e.preventDefault();
    variant = a.dataset.variant;
    elapsed = 0;
    sync();
    resize();
    if (ready) setPlaying(true);
  };
$("#play").onclick = () => {
  if (elapsed >= duration) elapsed = 0;
  setPlaying(!playing);
};
$("#restart").onclick = restart;
$("#duration").onchange = (e) => {
  duration = Number(e.target.value);
  elapsed = 0;
  sync();
  draw();
  ui();
};
$("#format").onchange = (e) => {
  portrait = e.target.value === "portrait";
  sync();
  resize();
};
$("#seek").oninput = (e) => {
  elapsed = Number(e.target.value);
  setPlaying(false);
  draw();
  ui();
};
function clean() {
  document.body.classList.toggle("clean");
  sync();
  if (document.body.classList.contains("clean"))
    window.scrollTo({ top: 0, behavior: "instant" });
}
$("#clean").onclick = clean;
$("#exitClean").onclick = clean;
document.addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (ready) {
      if (elapsed >= duration) elapsed = 0;
      setPlaying(!playing);
    }
  }
  if (e.key.toLowerCase() === "r" && ready) restart();
  if (e.key.toLowerCase() === "c") clean();
});
document.addEventListener("visibilitychange", () => {
  last = performance.now();
});
if (params.get("clean") === "1") document.body.classList.add("clean");
sync();
resize();
if (images.length) {
  for (let i = 0; i < 110; i++) requestImage(i);
  for (let i = 335; i < 365; i++) requestImage(i);
  if (variant === "reference") {
    for (let row = 0; row < 6; row++)
      for (let ahead = 0; ahead < 9; ahead++)
        requestImage(45 + row * 139 + ahead);
  }
  await new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      if ((!workers && !jobs.length) || performance.now() - started > 12000)
        resolve();
      else setTimeout(check, 80);
    };
    check();
  });
} else {
  atlas = new Image();
  atlas.src = "/assets/demo-creatives.jpg";
  try {
    await atlas.decode();
  } catch {
    atlas = null;
  }
}
ready = true;
$("#loading").hidden = true;
$("#play").disabled = false;
$("#status").textContent =
  `${fmt(total)} ${images.length ? "local images" : "simulated records"} · continuous motion · no paid calls`;
setPlaying(!reduced && params.get("autoplay") !== "0");
draw();
requestAnimationFrame(frame);
