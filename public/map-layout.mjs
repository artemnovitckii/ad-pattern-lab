// Neighbouring families share a thumbnail stack. Keep the representative's
// exact data position separately, so a leader can show any display offset.
export function creativeMapLayout(groups, bounds = groups, width = 560) {
  const scale = Math.max(.4, width / 560);
  const columns = Math.max(3, Math.min(12, Math.floor(507 * scale / 52)));
  const rows = Math.max(2, Math.min(5, Math.floor(284 * scale / 56)));
  let maxAge = 0, maxCount = 0;
  for (const group of bounds) {
    if (Number.isFinite(group.age)) maxAge = Math.max(maxAge, group.age);
    maxCount = Math.max(maxCount, group.n);
  }
  const xmax = Math.max(120, Math.ceil(maxAge / 60) * 60);
  const ystep = Math.max(1, Math.ceil(maxCount / 4));
  const ymax = ystep * 4;
  const x = age => 38 + age / xmax * 507;
  const y = count => 308 - count / ymax * 284;
  const buckets = new Map();
  for (const group of groups) {
    if (!Number.isFinite(group.age)) continue;
    const col = Math.min(columns - 1, Math.max(0, Math.floor(group.age / xmax * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(group.n / ymax * rows)));
    const key = `${col}:${row}`;
    if (!buckets.has(key)) buckets.set(key, {
      key, x: 38 + (col + .5) / columns * 507,
      y: 308 - (row + .5) / rows * 284, members: [],
    });
    buckets.get(key).members.push(group);
  }
  return { xmax, ymax, ystep, x, y, scale, columns, rows,
    thumbnailWidth: 32 / scale, thumbnailHeight: 40 / scale,
    clusters: [...buckets.values()],
  };
}

const projectionCache = new Map();
const familyId = group => group.ad.family || group.ad.id;
const labelEntries = group => Object.entries(group.ad.labels || {})
  .map(([key, result]) => [key, String(result.value || 'unknown')])
  .sort(([a], [b]) => a.localeCompare(b));

// Principal components of the actual categorical labels, with no age,
// confidence or outcome inputs. Identical labels get identical coordinates.
function labelProjection(bounds) {
  const entries = bounds.map(labelEntries);
  const signature = bounds.map((g, i) => `${familyId(g)}:${JSON.stringify(entries[i])}`).join('|');
  if (projectionCache.has(signature)) return projectionCache.get(signature);
  const features = [...new Set(entries.flatMap(values => values.map(([key, value]) => `${key}:${value}`)))].sort();
  const index = new Map(features.map((feature, i) => [feature, i]));
  const weights = { format: 1.4, hook: 1.4, angle: 1.1, offer: 1.1 };
  const vectors = entries.map(values => {
    const vector = new Float64Array(features.length);
    for (const [key, value] of values) vector[index.get(`${key}:${value}`)] = weights[key] || 1;
    return vector;
  });
  const d = features.length, mean = new Float64Array(d);
  for (const vector of vectors) for (let i = 0; i < d; i++) mean[i] += vector[i] / Math.max(1, vectors.length);
  const covariance = Array.from({ length: d }, () => new Float64Array(d));
  for (const vector of vectors) for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++)
    covariance[i][j] += (vector[i] - mean[i]) * (vector[j] - mean[j]);
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) covariance[j][i] = covariance[i][j];
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const axes = [];
  for (let axis = 0; axis < 2; axis++) {
    let vector = Float64Array.from({ length: d }, (_, i) => Math.sin((i + 1) * (axis + 1.7)));
    for (let iteration = 0; iteration < 70; iteration++) {
      const next = Float64Array.from(covariance, row => dot(row, vector));
      for (const previous of axes) {
        const overlap = dot(next, previous);
        for (let i = 0; i < d; i++) next[i] -= overlap * previous[i];
      }
      const length = Math.hypot(...next);
      if (length < 1e-9) { vector = new Float64Array(d); break; }
      vector = next.map(value => value / length);
    }
    axes.push(vector);
  }
  const values = vectors.map(vector => axes.map(axis => dot(vector.map((v, i) => v - mean[i]), axis)));
  const limits = [0, 1].map(axis => [Math.min(...values.map(v => v[axis])), Math.max(...values.map(v => v[axis]))]);
  const positions = new Map(bounds.map((group, i) => [familyId(group), values[i].map((value, axis) => {
    const [min, max] = limits[axis];
    return max - min < 1e-9 ? .5 : (value - min) / (max - min);
  })]));
  if (projectionCache.size >= 4) projectionCache.delete(projectionCache.keys().next().value);
  projectionCache.set(signature, positions);
  return positions;
}

export function creativeLandscapeLayout(groups, bounds = groups, width = 560) {
  const scale = Math.max(.4, width / 560);
  const thumbnailWidth = 26 / scale, thumbnailHeight = 34 / scale;
  const columns = Math.max(3, Math.min(18, Math.floor(507 * scale / 38)));
  const rows = Math.max(2, Math.min(9, Math.floor(284 * scale / 46)));
  const positions = labelProjection(bounds), slots = new Map();
  const cell = group => {
    const [u, v] = positions.get(familyId(group)) || [.5, .5];
    const col = Math.min(columns - 1, Math.floor(u * columns));
    const row = Math.min(rows - 1, Math.floor(v * rows));
    return { u, v, col, row, key: `labels:${col}:${row}` };
  };
  for (const group of bounds) {
    const position = cell(group);
    if (!slots.has(position.key)) slots.set(position.key, { ...position, u: 0, v: 0, count: 0 });
    const slot = slots.get(position.key);
    slot.u += position.u; slot.v += position.v; slot.count++;
  }
  const clusters = new Map(), clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  for (const group of groups) {
    const position = cell(group), slot = slots.get(position.key) || { ...position, count: 1 };
    if (!clusters.has(position.key)) {
      const centerX = 38 + (position.col + .5) / columns * 507;
      const centerY = 20 + (position.row + .5) / rows * 284;
      // Offset toward the real label centroid within each non-overlapping slot.
      const dx = clamp(38 + slot.u / slot.count * 507 - centerX, (507 / columns - thumbnailWidth) / 2 - 3 / scale);
      const dy = clamp(20 + slot.v / slot.count * 284 - centerY, (284 / rows - thumbnailHeight) / 2 - 3 / scale);
      clusters.set(position.key, { key: position.key, x: centerX + dx, y: centerY + dy, members: [] });
    }
    clusters.get(position.key).members.push(group);
  }
  return { scale, columns, rows, thumbnailWidth, thumbnailHeight, clusters: [...clusters.values()] };
}
