// Offline CPU/serialization benchmark. This does not measure real APIs or AI.
// node --experimental-transform-types --import ./tests/ts-resolver.mjs scripts/benchmark-docent.mjs <output.json>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {getFullDocentStory} from '../lib/docent-data.ts';
import {preparePlaceAnswer,guidePhotos} from '../lib/place-answer.ts';
const addresses=JSON.parse(readFileSync(new URL('../tests/fixtures/field-addresses.json',import.meta.url),'utf8'));
const results=addresses.map(address=>{
 const times=[];let packet,photos;
 for(let i=0;i<12;i++){
  const start=performance.now();
  packet=preparePlaceAnswer({address,story:getFullDocentStory(address.sggNm,address.emdNm)});
  photos=guidePhotos(packet);times.push(performance.now()-start);
 }
 return {name:address.bdNm,address:address.roadAddr,scope:'local_static_pipeline_no_api',runs:times.length,coldMs:times[0],warmMedianMs:times.slice(1).sort((a,b)=>a-b)[5],records:packet.neighborhood.selected,photos:photos.length,responseBytes:Buffer.byteLength(JSON.stringify({...packet,photos}))};
});
const output=resolve(process.argv[2]||'outputs/field-benchmark.json');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
