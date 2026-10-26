import assert from 'node:assert/strict';
import test from 'node:test';
import { researchFindings, patternExamples, copyBreakdown } from '../public/findings.mjs';

const ad = (id, format, days, family = id) => ({ id, family, brand:'Brand', status:'complete', active:true,
  collectedAt:'2026-10-01T00:00:00Z', startDate:new Date(Date.parse('2026-10-01T00:00:00Z')-days*864e5).toISOString(),
  labels:{ format:{value:format}, hook:{value:'frustration'}, offer:{value:'workshop'}, proof:{value:'numbers'} },
});
const archive = [...Array.from({length:30},(_,i)=>ad(`head-${i}`,'talking_head',i<12?70:10)),
  ...Array.from({length:80},(_,i)=>ad(`graphic-${i}`,'graphic',i<4?65:5)), ad('outlier','product',100)];

test('format insight excludes tiny outliers and links observed examples and facets',()=>{
  const finding=researchFindings(archive).find(f=>f.dimension==='format');
  assert.equal(finding.key,'talking_head');assert.equal(finding.n,30);assert.equal(finding.old,12);
  assert.equal(finding.share,.4);assert.equal(finding.comparison.key,'graphic');assert.equal(finding.comparison.share,.05);
  assert.deepEqual(finding.facets[0],{dimension:'hook',key:'frustration',n:12,total:12});
  assert.ok(finding.exampleIds.every(id=>archive.find(a=>a.id===id).labels.format.value==='talking_head'));
});

test('every scoped ad remains browsable and duplicate families are ordered after distinct examples',()=>{
  const rows=[ad('a','talking_head',80,'same'),ad('b','talking_head',79,'same'),ad('c','talking_head',70),ad('d','graphic',90)];
  assert.deepEqual(patternExamples(rows,'format','talking_head').map(a=>a.id),['a','c','b']);
  assert.equal(patternExamples(rows,'format','talking_head',{olderOnly:true}).length,3);
  assert.deepEqual(patternExamples(rows,'format','talking_head',{sort:'newest'}).map(a=>a.id),['c','b','a']);
  assert.equal(patternExamples(archive,'format','talking_head',{olderOnly:true}).length,12);
});

test('unknown dates and inactive ads do not enter the 60-day example filter',()=>{
  const rows=[ad('old','talking_head',70),{...ad('unknown','talking_head',80),startDate:null},{...ad('inactive','talking_head',90),active:false}];
  assert.deepEqual(patternExamples(rows,'format','talking_head',{olderOnly:true}).map(a=>a.id),['old']);
  assert.equal(patternExamples(rows,'format','talking_head').at(-1).id,'unknown');
});

test('copy sections retain all saved words and never claim ad copy is a transcript',()=>{
  const text='Business owners, can I get your email?\n\nThese are the systems we use.\n\n🔗 Download the guide today.\n\nP.S. It is free.';
  const result=copyBreakdown({text,transcript:''});
  assert.equal(result.source,'Saved ad copy');assert.equal(result.sections.length,3);
  assert.equal(result.sections[0].text,'Business owners, can I get your email?');
  assert.match(result.sections[2].text,/Download the guide/);
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  assert.equal(normalize(result.sections.map(s=>s.text).join(' ')),normalize(text));
});

test('text with no clear CTA is not given an invented one',()=>{
  const result=copyBreakdown({text:'This is a useful idea. Here is the supporting explanation.'});
  assert.equal(result.sections.some(s=>s.role.includes('call to action')),false);
  assert.equal(copyBreakdown({}).sections.length,0);
  assert.equal(copyBreakdown({text:'Ad copy',transcript:'Actually spoken words.'}).source,'Speech transcript');
});
