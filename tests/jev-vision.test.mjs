import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {classify,extract} from '../lib/providers.mjs';

const response = request => Response.json({model:'jev-test',usage:{input_tokens:1200},answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>[key,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9}]))});

test('native Jev images: actual preparation, multipart, shared requests, pixel cache and safe failures', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-images-')),oldFetch=global.fetch,previous={...process.env};
 process.env.ANALYSIS_PROVIDER='jev';process.env.TYPESAFE_API_KEY='test';process.env.TRANSCRIPTION_PROVIDER='none';
 let calls=0,seen=[];
 global.fetch=async(url,options)=>{
  calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');
  assert.equal(options.headers['TypeSafe-Danger-Zone-Images'],'true');
  assert.equal(options.headers['Content-Type'],undefined);
  assert.ok(options.body instanceof FormData);
  assert.equal([...options.body.keys()][0],'request');
  const request=JSON.parse(await options.body.get('request').text());seen.push(request);
  assert.equal(Object.keys(request.questions).length,7);
  assert.equal(Object.keys(request.assets).length,request.state.frames.length);
  for(const frame of request.state.frames){
   const asset=request.assets[frame.image];assert.equal(asset.type,'image');
   const bytes=new Uint8Array(await options.body.get(asset.part).arrayBuffer());assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
   assert.equal(JSON.stringify(request.state).split(frame.image).length-1,1);
  }
  assert.equal('active' in request.state,false);assert.equal('age' in request.state,false);assert.equal('roas' in request.state,false);
  return response(request);
 };
 try{
  const input=join(dir,'small.png');
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x180','-frames:v','1',input]);
  const prepared=await extract({kind:'image'},input,dir);
  const size=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',prepared.visualFrames[0].file],{encoding:'utf8'})).streams[0];
  assert.ok(size.width>=280&&size.height>=280&&size.width<=1280&&size.height<=1280);
  const ad={kind:'image',text:'Try our workshop.',age:999,active:true,roas:999,...prepared};
  const out=await Promise.all(Array.from({length:4},()=>classify(ad,dir)));
  assert.equal(calls,1);assert.equal(out.filter(r=>!r.cached).length,1);assert.ok(Math.abs(out.reduce((sum,r)=>sum+r.cost,0)-.0000504)<1e-12);
  assert.equal(out[0].visualSamples,1);assert.equal(out[0].provider,'jev');
  await classify(ad,dir);assert.equal(calls,1);
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=320x280','-frames:v','1',prepared.visualFrames[0].file]);
  await classify(ad,dir);assert.equal(calls,2,'changed image pixels invalidate cache');
  const video=join(dir,'clip.mp4');
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=green:s=320x240:d=4','-c:v','libx264','-pix_fmt','yuv420p',video]);
  const frames=await extract({kind:'video'},video,dir);assert.equal(frames.visualFrames.length,4);
  await classify({kind:'video',...frames},dir);assert.equal(seen.at(-1).state.frames.length,4);
  global.fetch=async()=>{calls++;throw Error('lost response')};
  await assert.rejects(classify({...ad,text:'uncertain request'},dir),/may have been billed/);
  assert.equal(calls,4,'lost paid response is not retried');
  global.fetch=async(url,options)=>{const req=JSON.parse(await options.body.get('request').text());const raw=await response(req).json();delete raw.usage;return Response.json(raw)};
  const unknown=await classify({...ad,text:'unknown billing'},dir);assert.equal(unknown.cost,null);assert.equal(unknown.inputTokens,null);
 }finally{
  global.fetch=oldFetch;
  for(const key of ['ANALYSIS_PROVIDER','TYPESAFE_API_KEY','TRANSCRIPTION_PROVIDER']) if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  await rm(dir,{recursive:true,force:true});
 }
});
