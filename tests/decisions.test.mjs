import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {decisionRequest,decisionLabels,classifyDecisions,sendDecisions} from '../lib/decisions.mjs';
import {extract} from '../lib/providers.mjs';

const answer = request => ({model:request.model,usage:{input_tokens:1000},answers:request.questions.map(q=>({name:q.name,type:'choice',choice:q.choices[0].value,confidence:0.91,probabilities:[]}))});
test('Decisions sends only creative evidence, inline images and named typed questions',()=>{
  const request=decisionRequest({text:'Save 20%',active:true,roas:1234,startDate:'2000-01-01'},[{dataUrl:'data:image/jpeg;base64,YQ==',time:1}]);
  assert.equal(request.model,'gpt-6-luna');assert.equal(request.questions.length,7);
  assert.equal(request.input[0].content.at(-1).type,'input_image');
  assert.equal(JSON.stringify(request).includes('1234'),false);
  assert.throws(()=>decisionRequest({},[{dataUrl:'https://example.com/image.jpg'}]),/inline/);
  const raw=answer(request);assert.equal(decisionLabels(raw,request.questions).format.confidence,.91);
  raw.answers[0]={name:'format',type:'refusal'};assert.equal(decisionLabels(raw,request.questions).format.refused,true);
  raw.answers[0]={name:'format',type:'choice',choice:'guaranteed_winner',confidence:.9};assert.throws(()=>decisionLabels(raw,request.questions),/Invalid/);
});
test('uncertain Decisions response is not automatically retried',async()=>{
  let calls=0;await assert.rejects(sendDecisions({},{key:'test',fetchImpl:async()=>{calls++;throw Error('Lost reply')}}),/may have been billed/);assert.equal(calls,1);
});
test('OpenAI caching includes visual content and missing usage stays unknown',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'decisions-cache-'));const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test';let calls=0;
  global.fetch=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/decisions');calls++;return Response.json(answer(JSON.parse(opts.body)));};
  try {
    const first=await classifyDecisions({text:'Save 20%'},dir),second=await classifyDecisions({text:'Save 20%'},dir);
    assert.equal(first.cost,.0001);assert.equal(second.cost,0);assert.equal(calls,1);
    const concurrent = await Promise.all(Array.from({length:4},()=>classifyDecisions({text:'Shared simultaneous evidence'},dir)));
    assert.equal(calls,2);assert.equal(concurrent.reduce((sum,r)=>sum+r.cost,0),.0001);
    assert.equal(concurrent.filter(r=>r.cached).length,3);
    global.fetch=async(url,opts)=>{const raw=answer(JSON.parse(opts.body));delete raw.usage;return Response.json(raw);};
    assert.equal((await classifyDecisions({text:'A different ad'},dir)).cost,null);
  }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
});
test('image and video -> actual frames -> Decisions -> persisted dashboard and exported provenance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'decisions-pipeline-'));
  const previous={...process.env};const oldFetch=global.fetch;process.env.LAB_DATA_DIR=dir;process.env.ANALYSIS_PROVIDER='openai';process.env.OPENAI_API_KEY='test';delete process.env.FIREWORKS_API_KEY;delete process.env.GROQ_API_KEY;
  let calls=0;global.fetch=async(url,opts)=>{calls++;const request=JSON.parse(opts.body);assert.ok(request.input[0].content.some(c=>c.type==='input_image'));return Response.json(answer(request));};
  try {
    const pipeline=await import('../lib/pipeline.mjs');await pipeline.init();
    const image=await readFile(new URL('../public/assets/demo-creatives.jpg',import.meta.url));
    await pipeline.addUpload({name:'Image fixture',kind:'image',base64:image.toString('base64')});await pipeline.processAds();
    let state=pipeline.publicState();assert.equal(state.ads[0].visualSamples,1,JSON.stringify(state.ads[0]));assert.equal(state.ads[0].analysisProvider,'openai');assert.equal(state.ads[0].status,'complete');assert.equal(state.ads[0].visualFrames[0].file,undefined);assert.match(state.ads[0].visualFrames[0].url,/api\/frame/);assert.equal(state.decisionsCost,.0001);
    await pipeline.processAds();assert.equal(calls,1);
    const video=join(dir,'test.mp4');execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x240:d=4','-c:v','libx264','-pix_fmt','yuv420p',video]);
    const evidence=await extract({kind:'video'},video,join(dir,'cache'));assert.equal(evidence.visualFrames.length,4);
    for(const frame of evidence.visualFrames)assert.ok((await readFile(frame.file)).length>0);
    await pipeline.addUpload({name:'Video fixture',kind:'video',base64:(await readFile(video)).toString('base64')});await pipeline.processAds();
    state=pipeline.publicState();assert.equal(state.ads.at(-1).visualSamples,4);assert.equal(state.ads.at(-1).status,'complete');assert.equal(calls,2);
    const exported=pipeline.exportState();assert.equal(exported.ads.at(-1).analysisProvider,'openai');assert.equal(exported.ads.at(-1).visualSamples,4);assert.equal(JSON.stringify(exported).includes(dir),false);
    await pipeline.importRows(Array.from({length:20},(_,i)=>({id:String(i),text:'Classify this real-looking fixture.'})));
    calls=0;global.fetch=async()=>{calls++;return new Response('',{status:429});};
    await pipeline.processAds();
    assert.equal(calls,4);assert.equal(pipeline.getState().status,'partial');
    assert.equal(pipeline.getState().ads.filter(a=>a.status==='pending').length,16);
    assert.match(pipeline.getState().error,/Unfinished ads are saved/);
  }finally{global.fetch=oldFetch;for(const key of ['LAB_DATA_DIR','ANALYSIS_PROVIDER','OPENAI_API_KEY','FIREWORKS_API_KEY','GROQ_API_KEY'])if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];await rm(dir,{recursive:true,force:true});}
});
