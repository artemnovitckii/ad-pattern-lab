import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analysisProvider} from '../lib/providers.mjs';

test('new installations default to Jev without an OpenAI key', () => {
  const previous = process.env.ANALYSIS_PROVIDER;
  delete process.env.ANALYSIS_PROVIDER;
  try { assert.equal(analysisProvider(), 'jev'); }
  finally { if(previous === undefined) delete process.env.ANALYSIS_PROVIDER; else process.env.ANALYSIS_PROVIDER = previous; }
});

test('switching to Jev reanalyses prior-provider records and preserves their cost ledger', async () => {
  const dir = await mkdtemp(join(tmpdir(),'jev-restore-'));
  const previous = {...process.env}, oldFetch = global.fetch;
  process.env.LAB_DATA_DIR = dir;
  process.env.ANALYSIS_PROVIDER = 'jev';
  process.env.TYPESAFE_API_KEY = 'test';
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const request = JSON.parse(options.body);
    assert.match(JSON.stringify(request.state), /Book a marketing workshop/);
    assert.equal(JSON.stringify(request.state).includes('old-visual-result'), false);
    assert.equal(JSON.stringify(request).includes('data:image'), false);
    calls++;
    return Response.json({model:request.model, usage:{input_tokens:1000}, answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>[key,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9}]))});
  };
  try {
    const pipeline = await import('../lib/pipeline.mjs');
    await pipeline.init();
    await pipeline.importRows([{id:'prior-provider',text:'Book a marketing workshop.'}]);
    Object.assign(pipeline.getState().ads[0],{status:'complete',analysisProvider:'openai',analysisVersion:'old-visual-result'});
    pipeline.getState().decisionsCost = .5;
    await pipeline.processAds();
    const result = pipeline.publicState();
    assert.equal(calls, 1);
    assert.equal(result.analysisProvider, 'jev');
    assert.equal(result.ads[0].analysisProvider, 'jev');
    assert.equal(result.ads[0].analysisVersion, 'jev-vision-v1');
    assert.equal(result.ads[0].status, 'complete');
    assert.equal(result.decisionsCost, .5);
    assert.equal(result.jevCost, .000042);
    await pipeline.processAds();
    assert.equal(calls, 1);
    assert.equal(pipeline.publicState().jevCost, .000042);
  } finally {
    global.fetch = oldFetch;
    for (const key of ['LAB_DATA_DIR','ANALYSIS_PROVIDER','TYPESAFE_API_KEY']) if(previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    await rm(dir,{recursive:true,force:true});
  }
});
