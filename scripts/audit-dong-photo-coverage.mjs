import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const regions=JSON.parse(fs.readFileSync(path.join(root,'data/seoul-regions.json'),'utf8'));
const adminMap=JSON.parse(fs.readFileSync(path.join(root,'data/seoul-administrative-dongs.json'),'utf8'));
const sources=['data/seoul-archives/photos.json','data/seoul-museum/photos.json','data/seongbuk-archive/photos.json'];
const records=sources.flatMap(file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).map((row,index)=>({...row,index,sourceFile:file})));
const research=JSON.parse(fs.readFileSync(path.join(root,'data/photo-research/bundle.json'),'utf8'));
const allowedResearch=row=>{
 const site=row.values?.['사이트표시가능여부']||'',thumbnail=row.values?.['썸네일표시가능여부']||'',terms=row.values?.['이용조건']||'';
 if(site||thumbnail){if(!/^가능(?:$|[\s(（·:])/.test(site)||!/^가능(?:$|[\s(（·:])/.test(thumbnail))return false;}
 else if(!/(?:공공누리\s*제?\s*1\s*유형|제한없음|public domain)/i.test(terms))return false;
 const url=row.previewUrl||'';if(!/^https:\/\//.test(url)||!/^https:\/\//.test(row.sourceUrl||''))return false;
 try{const parsed=new URL(url);return !parsed.username&&!parsed.password&&(/\.(?:avif|gif|jpe?g|png|webp|tmb)$/i.test(parsed.pathname)||(parsed.hostname==='archive-file.sb.go.kr'&&/^\/files\/(?:service|upload)File\/archive\/item\//.test(parsed.pathname)));}catch{return false;}
};
for(const [index,row] of research.items.entries())if(row.recordType==='visual'&&!row.candidate&&!row.correctionOf&&!row.conflictMentioned&&allowedResearch(row))records.push({district:row.district,dong:row.dong,title:row.values['자료명']||row.id,date:row.values['촬영·제작일']||row.values['역사적대상시기']||'시기 미상',imageUrl:row.previewUrl,sourceUrl:row.sourceUrl,institution:row.values['제공기관·채널']||row.provider,credit:row.values['필수출처표시문구']||row.provider,license:row.values['이용조건']||'',allowDisplay:true,regionLinks:row.regionLinks,sourceFile:'data/photo-research/bundle.json',index});
const allowed=row=>row.allowDisplay===true&&/^https:\/\//.test(row.imageUrl||'')&&/^https:\/\//.test(row.sourceUrl||'')&&!!row.license&&!!row.institution;
const rowDongs=row=>new Set([row.dong,...(row.regionLinks||[]).filter(link=>link['조사단계']==='법정동').map(link=>link['법정동'])].filter(Boolean));
const byUrl=new Map();
const rows=[];
function addCoverageRow(district,kind,legalDongs,legalDongLabel,administrativeDongLabel){
  const legalSet=new Set(legalDongs);
  const local=records.filter(row=>row.district===district&&[...rowDongs(row)].some(dong=>legalSet.has(dong)));
  const display=local.filter(allowed);
  const districtFallback=display.length?[]:records.filter(row=>row.district===district&&allowed(row));
  const selected=display.length?display:districtFallback;
  const photo=selected[0];
  if(photo&&!byUrl.has(photo.imageUrl))byUrl.set(photo.imageUrl,{url:photo.imageUrl,result:null});
  rows.push({district,kind,legalDongs:legalDongLabel,administrativeDongs:administrativeDongLabel,records:local,display,fallback:districtFallback,selected,photo});
}
for(const district of regions.districts){
 const official=adminMap.districts.find(item=>item.name===district.name);
 for(const dong of district.dongs){
  const administrative=official.mappings.filter(mapping=>mapping.legalDongs.includes(dong)).map(mapping=>mapping.administrativeDong);
  addCoverageRow(district.name,'법정동',[dong],dong,administrative.join(' · '));
 }
 for(const mapping of official.mappings){
  addCoverageRow(district.name,'행정동',mapping.legalDongs,mapping.legalDongs.join(' · '),mapping.administrativeDong);
 }
}

async function probe(url){
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  const response=await fetch(url,{headers:{Accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8','User-Agent':'SeoulPlaceDocent/1.0 photo-coverage-audit'},signal:controller.signal,redirect:'follow'});
  clearTimeout(timer);let mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const reader=response.body?.getReader();const first=reader?await reader.read():{value:undefined};
  if(!mime||mime==='application/octet-stream'||mime==='binary/octet-stream'){
   const b=first.value||new Uint8Array();
   if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)mime='image/jpeg';
   else if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)mime='image/png';
   else if(String.fromCharCode(...b.subarray(0,3))==='GIF')mime='image/gif';
   else if(String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP')mime='image/webp';
  }
  await reader?.cancel().catch(()=>{});
  return {ok:response.ok&&mime.startsWith('image/'),status:response.status,mime,error:response.ok&&!mime.startsWith('image/')?'non_image_content_type':''};
 }catch(error){return {ok:false,status:'',mime:'',error:error?.name==='AbortError'?'timeout':String(error?.message||error).slice(0,120)}}
}
if(process.argv.includes('--probe')){
 const queue=[...byUrl.values()];let next=0;
 await Promise.all(Array.from({length:8},async()=>{while(true){const i=next++;if(i>=queue.length)return;queue[i].result=await probe(queue[i].url);}}));
}

const csvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const header=['자치구','동 구분','법정동','행정동','검색한 자료 수','실제 표시 가능한 사진 수','직접 동 자료 수','자치구 대체 자료 수','사진 URL 응답 성공 수','최종 사진 표시 성공 여부','실패 원인','미확인·추가 조사 사항'];
const csv=[header.map(csvCell).join(',')];
for(const row of rows){
 const probeResult=row.photo?byUrl.get(row.photo.imageUrl)?.result:null;
 const success=!!probeResult?.ok;
 const fallback=row.display.length===0&&row.fallback.length>0;
 const scope=fallback?'구 배경 사진':'동 직접 색인 사진';
 const error=!row.photo?'이 동에 연결된 표시 허용 사진을 찾지 못함':probeResult&&!probeResult.ok?`${probeResult.status||'요청 실패'} ${probeResult.mime||probeResult.error}`:!process.argv.includes('--probe')?'이미지 URL 응답 미측정':'';
 const unknown=[row.kind==='행정동'?'행정동은 서울시 공식 관할 법정동 매핑으로 집계; 사진의 세부 촬영 위치·건물 관계는 미확인':'사진의 건물·필지 직접 관계는 확인되지 않음',fallback?'구 단위 대체 사진의 실제 촬영 동을 카드에 별도 표시':'',!process.argv.includes('--probe')?'실제 이미지 HTTP 응답 미측정':'MCP 전체 요청 흐름 및 사용자 화면 렌더링은 별도 미검증'].filter(Boolean).join(' · ');
 csv.push([row.district,row.kind,row.legalDongs,row.administrativeDongs,row.records.length,row.selected.length,row.display.length,fallback?row.fallback.length:0,success?1:0,success?'HTTP 이미지 응답 확인 · MCP/UI 미실증':'아니오',error,`${scope}; ${unknown}`].map(csvCell).join(','));
}
const output=path.join(root,'outputs/seoul-dong-photo-coverage.csv');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,csv.join('\n')+'\n','utf8');
const districtStats=Object.fromEntries(regions.districts.map(d=>[d.name,Object.fromEntries(['법정동','행정동'].map(kind=>[kind,{dongs:rows.filter(r=>r.district===d.name&&r.kind===kind).length,withDirect:rows.filter(r=>r.district===d.name&&r.kind===kind&&r.display.length).length,withoutDirect:rows.filter(r=>r.district===d.name&&r.kind===kind&&!r.display.length).length,httpSuccess:rows.filter(r=>r.district===d.name&&r.kind===kind&&r.photo&&byUrl.get(r.photo.imageUrl)?.result?.ok).length}]))]));
console.log(JSON.stringify({output,legalDongs:rows.filter(r=>r.kind==='법정동').length,administrativeDongs:rows.filter(r=>r.kind==='행정동').length,distinctImagesProbed:process.argv.includes('--probe')?byUrl.size:0,dongDirectPhotoCoverage:rows.filter(r=>r.display.length).length,withoutDongPhoto:rows.filter(r=>!r.display.length).length,httpSuccess:rows.filter(r=>r.photo&&byUrl.get(r.photo.imageUrl)?.result?.ok).length,districtStats},null,2));
