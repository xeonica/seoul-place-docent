import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function readDistrictResearchAsset(kind:'articles'|'photos',district:string){
 if(!['articles','photos'].includes(kind)||!/^[가-힣]+구$/.test(district))throw new Error('Invalid district shard');
 return new Uint8Array(await readFile(join(process.cwd(),'public/research/seoul-district-collection/shards',kind,district+'.json.gz')));
}
/** Native Next.js: tracing includes these generated public assets. */
export async function readVideoRecordAsset(key:string){
 if(!/^\d+$/.test(key))throw new Error('Invalid video shard');
 return new Uint8Array(await readFile(join(process.cwd(),'public/research/video-records',key+'.json.gz')));
}
export async function readArticleEvidenceAsset(district:string){
 if(!/^[가-힣]+구$/.test(district))throw new Error('Invalid article district');
 return new Uint8Array(await readFile(join(process.cwd(),'public/research/article-evidence',district+'.json.gz')));
}
