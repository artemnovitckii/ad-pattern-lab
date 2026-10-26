import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mediaURL} from './providers.mjs';
import {hash} from './data.mjs';
import {VISUAL_VERSION,IMAGE_FILTER} from './decisions.mjs';
const exec=promisify(execFile), jobs=new Map();

// FFmpeg seeks within the public video using HTTP ranges, rather than saving the whole file.
// This path deliberately handles visual-only runs; speech uses the ordinary local extractor.
export async function remoteVideoFrames(raw, cacheDir) {
  const url=mediaURL(raw), key=new URL(url).origin+new URL(url).pathname;
  if(!jobs.has(key)){
    const job=sample(url,key,cacheDir);jobs.set(key,job);job.catch(()=>jobs.delete(key));
  }
  return structuredClone(await jobs.get(key));
}
async function sample(url,key,cacheDir){
  const dir=join(cacheDir,'remote-frames-'+hash(key).slice(0,16));await mkdir(dir,{recursive:true});
  try{
    const probe=JSON.parse((await exec('ffprobe',['-v','error','-rw_timeout','20000000','-protocol_whitelist','https,tls,tcp','-show_entries','format=duration','-of','json',url],{timeout:30000})).stdout);
    const duration=Number(probe.format?.duration);
    if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('Use a video between 0 and 600 seconds.');
    const times=[...new Set([0,Math.min(1,duration/4),Math.min(3,duration/2),duration*.6])],visualFrames=[];
    for(let i=0;i<times.length;i++){
      const file=join(dir,i+'.jpg');
      await exec('ffmpeg',['-y','-v','error','-rw_timeout','20000000','-protocol_whitelist','https,tls,tcp','-ss',String(times[i]),'-i',url,'-frames:v','1','-vf',IMAGE_FILTER,'-q:v','3',file],{timeout:30000});
      visualFrames.push({file,time:times[i]});
    }
    return {visualFrames,visualVersion:VISUAL_VERSION,transcript:'',duration,warning:'Visual decisions cover four sampled frames, not the entire video. Speech skipped for this run; classifications use sampled frames and ad copy.'};
  }catch(e){throw Error(e.message==='Use a video between 0 and 600 seconds.'?e.message:'Remote video sampling failed; use downloaded media or a preview image.');}
}
