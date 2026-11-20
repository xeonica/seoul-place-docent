/** Bounded, in-process public-data cache. Never use this for approvals/rights. */
export class DocentCache<T>{
 private entries=new Map<string,{expires:number;value:Promise<T>}>();
 constructor(private ttlMs:number,private capacity=64){}
 async get(key:string,load:()=>Promise<T>,now=Date.now()){
  const old=this.entries.get(key);
  if(old&&old.expires>now){this.entries.delete(key);this.entries.set(key,old);return {value:await old.value,cache:'HIT' as const};}
  this.entries.delete(key);const entry={expires:now+this.ttlMs,value:load()};this.entries.set(key,entry);
  while(this.entries.size>this.capacity)this.entries.delete(this.entries.keys().next().value!);
  try{return {value:await entry.value,cache:'MISS' as const};}catch(error){if(this.entries.get(key)===entry)this.entries.delete(key);throw error;}
 }
}
export async function credentialPartition(value:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export type StageTiming={stage:string;ms:number;status:'ok'|'unavailable';cache?:'HIT'|'MISS'};
export class DocentTrace{
 readonly stages:StageTiming[]=[];
 private start=performance.now();
 async measure<T>(stage:string,run:()=>Promise<T>):Promise<T>{const start=performance.now();try{const value=await run();this.stages.push({stage,ms:Math.round(performance.now()-start),status:value===undefined||value&&typeof value==='object'&&'status' in value&&['unavailable','backend_unavailable','query_error'].includes(String(value.status))?'unavailable':'ok'});return value;}catch(e){this.stages.push({stage,ms:Math.round(performance.now()-start),status:'unavailable'});throw e;}}
 snapshot(){return {serverProcessingMs:Math.round(performance.now()-this.start),stages:this.stages,clientAiGenerationMs:null,networkTransferMs:null,firstUsefulInformationMs:null,scope:'server_only',note:'네트워크 전송·사용자 AI 생성·화면 표시 시간은 서버에서 측정하지 않았습니다.'};}
}
