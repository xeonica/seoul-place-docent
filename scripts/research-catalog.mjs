import {createHash} from 'node:crypto';

/** Strict RFC-style CSV parsing; retain physical source lines, including quoted newlines. */
export function parseCsv(text) {
 const out=[];let cells=[],field='',quoted=false,closed=false,line=1,start=1;
 const cell=()=>{cells.push(field);field='';closed=false;};
 const row=()=>{cell();if(cells.some(v=>v.trim()))out.push({line:start,cells});cells=[];start=line+1;};
 text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"'){quoted=false;closed=true;}else field+=ch;}
  else if(ch===',')cell();
  else if(ch==='\n')row();
  else if(ch==='"'&&!field&&!closed)quoted=true;
  else {if(closed||ch==='"')throw new Error(`Invalid CSV quoting at line ${line}`);field+=ch;}
  if(ch==='\n')line++;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 if(field||cells.length||closed)row();
 const head=out.shift()?.cells;
 if(!head||head.some(h=>!h)||new Set(head).size!==head.length)throw new Error('Invalid CSV headers');
 return {headers:head,rows:out.map(r=>{if(r.cells.length!==head.length)throw new Error(`CSV column count at line ${r.line}`);return {line:r.line,values:Object.fromEntries(head.map((h,i)=>[h,r.cells[i]]))};})};
}
export function canonicalSource(value){
 try{
  const u=new URL(value.trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['sso','tr_code'].includes(k))u.searchParams.delete(k);
  // Only this provider documents zero-padded identifiers as the same record.
  if(u.hostname==='archives.seoul.go.kr')u.pathname=u.pathname.replace(/^(\/item\/)0+(?=\d)/,'$1');
  u.pathname=u.pathname.replace(/\/$/,'')||'/';u.searchParams.sort();return u.href;
 }catch{return null;}
}
const pick=(v,...keys)=>keys.map(k=>v[k]?.trim()).find(Boolean)||'';
export function buildCatalog(files){
 const places=new Map(),links=new Map(),records=new Map(),sourceFiles=files.map(f=>({path:f.path,sha256:f.sha256,rows:f.rows.length}));let inputRows=0,invalidUrlRows=0;
 for(const f of files){if(f.path.endsWith('/places.csv'))for(const r of f.rows)places.set(r.values.place_id,r.values);
  if(f.path.endsWith('/record_place_links.csv'))for(const r of f.rows){const v=r.values;links.set(v.record_id,[...(links.get(v.record_id)||[]),v]);}}
 for(const f of files){
  if(f.path.endsWith('/places.csv')||f.path.endsWith('/record_place_links.csv'))continue;
  if(!f.headers.some(h=>['원문URL','source_url'].includes(h)))throw new Error(`Unsupported research schema: ${f.path}`);
  for(const {line,values:v} of f.rows){inputRows++;const sourceUrl=canonicalSource(pick(v,'원문URL','source_url'));if(!sourceUrl){invalidUrlRows++;continue;}
   const recordId=pick(v,'자료ID','record_id','candidate_id');
   const relations=(links.get(recordId)||[]).map(l=>({...l,place:places.get(l.place_id)||null}));
   const observation={file:f.path,line,recordId,originalUrl:pick(v,'원문URL','source_url'),title:pick(v,'자료명','후보명','record_title','title'),institution:pick(v,'제공기관·채널','기관','source_institution','institution'),mediaType:pick(v,'매체유형','자료유형','record_type','material_type'),date:pick(v,'역사적대상시기','생산시기','production_date','record_date','created_year'),district:pick(v,'자치구','district'),location:pick(v,'원문장소표기','관련장소','place_name','historical_place_name','location_scope','장소관련성'),scope:pick(v,'공간범위','location_scope','장소관련성'),relation:pick(v,'주소관계상태','장소관련성'),reviewStatus:pick(v,'검토상태','검토등급','접근성_검증수준','review_status','verification_status'),rights:pick(v,'이용조건','권리상태','rights_status'),checkedAt:pick(v,'확인일','수집일','검증일','checked_date','collected_at'),description:pick(v,'내용설명','description','evidence_excerpt'),notes:pick(v,'추가확인사항','비고','다음조치','notes'),permissions:{display:pick(v,'사이트표시가능여부','사이트활용승인','usage_approved'),thumbnail:pick(v,'썸네일표시가능여부'),embed:pick(v,'임베드가능여부')},relations};
   let record=records.get(sourceUrl);
   if(!record){record={id:'research:'+createHash('sha256').update(sourceUrl).digest('hex').slice(0,24),sourceUrl,observations:[]};records.set(sourceUrl,record);}
   record.observations.push(observation);
  }
 }
 const items=[...records.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const contentSha256=createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex');
 return {meta:{version:1,contentSha256,sourceFiles,inputRows,uniqueSources:items.length,duplicateRows:inputRows-invalidUrlRows-items.length,invalidUrlRows,mode:'research_candidates_only',autoApprovedRecords:0},items};
}
