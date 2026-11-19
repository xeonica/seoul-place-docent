import {env} from 'cloudflare:workers';
/** Read the same deployment's static assets, without an external HTTP request. */
export async function readVideoRecordAsset(key:string){
 if(!/^\d+$/.test(key)||!env.ASSETS)throw new Error('Video assets unavailable');
 const response=await env.ASSETS.fetch('https://assets.local/research/video-records/'+key+'.json.gz');
 if(!response.ok)throw new Error('Video provenance asset is missing');
 return new Uint8Array(await response.arrayBuffer());
}
export async function readArticleEvidenceAsset(district:string){
 if(!/^[가-힣]+구$/.test(district)||!env.ASSETS)throw new Error('Article assets unavailable');
 const response=await env.ASSETS.fetch('https://assets.local/research/article-evidence/'+encodeURIComponent(district)+'.json.gz');
 if(!response.ok)throw new Error('Article metadata asset is missing');
 return new Uint8Array(await response.arrayBuffer());
}
