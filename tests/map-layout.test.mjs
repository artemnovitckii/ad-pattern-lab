import assert from 'node:assert/strict';
import test from 'node:test';
import { creativeMapLayout, creativeLandscapeLayout } from '../public/map-layout.mjs';

const archive = Array.from({ length: 1147 }, (_, i) => ({
  ad: { id: `ad-${i}` }, age: 1 + i % 112, n: i < 1081 ? 1 : i < 1146 ? 2 : 3,
}));

test('dense thumbnail stacks do not collide at desktop and mobile widths', () => {
  for (const width of [280, 360, 560, 900]) {
    const layout = creativeMapLayout(archive, archive, width);
    const { clusters, thumbnailWidth: w, thumbnailHeight: h } = layout;
    assert.equal(layout.xmax, 120);
    assert.equal(layout.ymax, 4);
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      assert.ok(Math.abs(a.x - b.x) >= w + 4 / layout.scale || Math.abs(a.y - b.y) >= h + 4 / layout.scale,
        `${width}px: ${a.key} overlaps ${b.key}`);
    }
    assert.ok(clusters.every(c => c.x - w / 2 >= 38 && c.x + w / 2 <= 545));
    assert.ok(clusters.every(c => c.y - h / 2 >= 20 && c.y + h / 2 <= 308));
  }
});

test('grouping preserves every family and leaves its actual age and count intact', () => {
  const original = JSON.stringify(archive);
  const layout = creativeMapLayout(archive);
  const members = layout.clusters.flatMap(c => c.members);
  assert.equal(members.length, 1147);
  assert.equal(new Set(members.map(g => g.ad.id)).size, 1147);
  assert.equal(JSON.stringify(archive), original);
  assert.equal(layout.x(60), 291.5);
  assert.equal(layout.y(1), 237);
});

test('replay axes and cluster slots follow the complete archive as ads arrive', () => {
  const full = creativeMapLayout(archive);
  for (const count of [1, 180, 500, 1147]) {
    const partial = creativeMapLayout(archive.slice(0, count), archive);
    assert.equal(partial.xmax, full.xmax);
    assert.equal(partial.ymax, full.ymax);
    for (const c of partial.clusters) {
      const final = full.clusters.find(g => g.key === c.key);
      assert.equal(c.x, final.x); assert.equal(c.y, final.y);
    }
  }
});

test('empty, undated, and large-family archives retain usable axes', () => {
  assert.equal(creativeMapLayout([]).clusters.length, 0);
  assert.equal(creativeMapLayout([{ad:{id:'unknown'}, age:null, n:1}]).clusters.length, 0);
  const large = creativeMapLayout([{ad:{id:'large'}, age:218, n:24}]);
  assert.equal(large.xmax, 240); assert.equal(large.ymax, 24);
  assert.equal(large.clusters[0].members[0].n, 24);
});

const varied = archive.map((group, i) => ({ ...group, n: 1, ad: { ...group.ad, labels: {
  format: { value: ['graphic', 'talking_head', 'testimonial'][i % 3] },
  hook: { value: ['curiosity', 'frustration', 'result', 'direct'][Math.floor(i / 3) % 4] },
  offer: { value: ['workshop', 'free_resource'][Math.floor(i / 12) % 2] },
  proof: { value: ['none', 'numbers', 'testimonial'][Math.floor(i / 24) % 3] },
} } }));

test('actual label differences create a landscape even when every family has one ad', () => {
  const layout = creativeLandscapeLayout(varied);
  // The two principal components need not expose every label combination.
  assert.ok(layout.clusters.length >= 3);
  assert.ok(new Set(layout.clusters.map(c => c.key.split(':')[1])).size >= 2);
  assert.ok(new Set(layout.clusters.map(c => c.key.split(':')[2])).size >= 2);
  const members = layout.clusters.flatMap(c => c.members);
  assert.equal(new Set(members.map(g => g.ad.id)).size, varied.length);
});

test('identical labels stay together without fabricated creative differences', () => {
  const same = archive.map(g => ({...g, ad:{...g.ad, labels:{format:{value:'graphic'}, hook:{value:'direct'}}}}));
  assert.equal(creativeLandscapeLayout(same).clusters.length, 1);
  assert.equal(creativeLandscapeLayout(archive).clusters.length, 1);
  assert.equal(creativeLandscapeLayout([]).clusters.length, 0);
});

test('creative similarity does not derive positions from age, family size, or confidence', () => {
  const altered = varied.map(g => ({...g, age:null, n:100, ad:{...g.ad, labels:Object.fromEntries(Object.entries(g.ad.labels).map(([k,v])=>[k,{...v,confidence:.01}]))}}));
  const before = creativeLandscapeLayout(varied), after = creativeLandscapeLayout(altered);
  assert.deepEqual(before.clusters.map(c=>[c.key,c.x,c.y,c.members.map(g=>g.ad.id)]),after.clusters.map(c=>[c.key,c.x,c.y,c.members.map(g=>g.ad.id)]));
});

test('landscape thumbnails remain separate and replay positions remain stable', () => {
  for (const width of [280, 360, 560, 900]) {
    const full = creativeLandscapeLayout(varied, varied, width), {thumbnailWidth:w,thumbnailHeight:h} = full;
    for (let i=0;i<full.clusters.length;i++) for (let j=i+1;j<full.clusters.length;j++) {
      const a=full.clusters[i],b=full.clusters[j];
      assert.ok(Math.abs(a.x-b.x)>=w+5/full.scale || Math.abs(a.y-b.y)>=h+5/full.scale, `landscape overlap at ${width}px`);
    }
    for (const c of creativeLandscapeLayout(varied.slice(0,180),varied,width).clusters) {
      const final=full.clusters.find(g=>g.key===c.key);
      assert.equal(c.x,final.x);assert.equal(c.y,final.y);
    }
  }
});
