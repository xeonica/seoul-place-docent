import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
/** Native Next.js: tracing includes these generated public assets. */
export async function readVideoRecordAsset(key:string){
 if(!/^\d+$/.test(key))throw new Error('Invalid video shard');
 return new Uint8Array(await readFile(join(process.cwd(),'public/research/video-records',key+'.json.gz')));
}
