import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceUrl='https://www.seoul.go.kr/seoul/autonomy_sub.do';
const response=await fetch(sourceUrl,{headers:{'User-Agent':'SeoulPlaceDocent/1.0 (official dong map import)','Accept':'text/html'}});
if(!response.ok)throw new Error(`서울시 공식 행정동 페이지 HTTP ${response.status}`);
const html=await response.text();
const unescape=value=>value.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
function normalizeName(cell){
 const plain=unescape(cell.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,'')).replace(/\([^)]*\)|（[^）]*）/g,'').replace(/\s+/g,' ').trim();
 return plain.replace(/洞/g,'동').replace(/\s+/g,'');
}
const districts=[];
for(const [,table] of html.matchAll(/<table\b[^>]*class=["'][^"']*tstyle04[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)){
 const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
 const mappings=[];
 for(const [,row] of rows){
  const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([,cell])=>normalizeName(cell));
  if(cells.length<2)continue;
  const [administrativeDong,legalText]=cells;
  const legalDongs=legalText.split(/[,，]/).map(value=>value.trim()).filter(Boolean).flatMap(value=>{
   if(value==='인현동')return ['인현동1가','인현동2가'];
   if(value==='만리동1가만리동2가')return ['만리동1가','만리동2가'];
   const combined=value.match(/^(.+?)1[.·ㆍ]2가$/);return combined?[combined[1]+'1가',combined[1]+'2가']:[value];
  });
  if(!administrativeDong||!legalDongs.length)continue;
  mappings.push({administrativeDong,legalDongs});
 }
 const caption=table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1]||'';
 const district=normalizeName(caption.replace(/<i>[\s\S]*?<\/i>/gi,'').replace(/-.*/s,''));
 if(district&&mappings.length)districts.push({name:district,mappings});
}
const adminCount=new Set(districts.flatMap(d=>d.mappings.map(m=>d.name+'|'+m.administrativeDong))).size;
const legalCount=new Set(districts.flatMap(d=>d.mappings.flatMap(m=>m.legalDongs.map(name=>d.name+'|'+name)))).size;
if(districts.length!==25||adminCount!==427||legalCount!==467)throw new Error(`공식 동 매핑 수 불일치: gu=${districts.length}, admin=${adminCount}, legal=${legalCount}`);
const out={sourceUrl,retrievedAt:new Date().toISOString().slice(0,10),administrativeDongCount:adminCount,legalDongCount:legalCount,districts};
fs.writeFileSync(path.join(root,'data/seoul-administrative-dongs.json'),JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify({path:'data/seoul-administrative-dongs.json',districts:districts.length,administrativeDongs:adminCount,legalDongs:legalCount},null,2));
