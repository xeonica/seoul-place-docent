import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,canonicalSource,buildCatalog} from '../scripts/research-catalog.mjs';
import {searchResearchRecords,placeResearchCandidates,researchCatalogStatus} from '../lib/research-catalog.ts';
import app from '../deploy/public-mcp/entry.ts';

test('CSV preserves quoted commas, escaped quotes and physical provenance lines; malformed input fails closed',()=>{
 const parsed=parseCsv('\uFEFFtitle,url\r\n"a, ""b""\ncontinued",https://example.org/1\r\nc,https://example.org/2\r\n');
 assert.equal(parsed.rows[0].values.title,'a, "b"\ncontinued');assert.deepEqual(parsed.rows.map(r=>r.line),[2,4]);
 for(const csv of ['x,x\na,b','x,y\n"unclosed,a','x,y\na,b,c','x,y\n"a"trailing,b'])assert.throws(()=>parseCsv(csv));
});
test('URL dedup retains every observation, conflicting permissions and original place link review',()=>{
 const f=(path,csv)=>({path,sha256:'fixture',...parseCsv(csv)});
 const bundle=buildCatalog([
 f('research-data/places.csv','place_id,place_name,district,legal_dong,location_review_status\np,당인리발전소,마포구,당인동,UNVERIFIED'),
 f('research-data/record_place_links.csv','record_id,place_id,relation_type,relation_evidence,link_review_status\na,p,EXACT_SITE,조사 메모,NEEDS_REVIEW'),
 f('research-data/a.csv','record_id,title,source_url,rights_status\na,장소 후보,https://archives.seoul.go.kr/item/00000621?utm_source=x,unknown\nb,상이한 제목,https://archives.seoul.go.kr/item/621,RESTRICTED_AI_USE')]);
 assert.equal(bundle.meta.uniqueSources,1);assert.equal(bundle.meta.duplicateRows,1);assert.equal(bundle.meta.autoApprovedRecords,0);
 const obs=bundle.items[0].observations;assert.equal(obs.length,2);assert.equal(obs[1].rights,'RESTRICTED_AI_USE');
 assert.equal(obs[0].relations[0].place.location_review_status,'UNVERIFIED');assert.equal(obs[0].relations[0].relation_type,'EXACT_SITE');
 assert.equal(canonicalSource('https://example.org/000621'),'https://example.org/000621');
 for(const u of ['javascript:alert(1)','https://user:secret@example.org','not a URL'])assert.equal(canonicalSource(u),null);
});
test('current GitHub CSVs are searchable, paginated, and never promoted into visual or verified evidence',()=>{
 assert.ok(researchCatalogStatus.uniqueSources>1000);
 const first=searchResearchRecords({query:'세운상가',limit:2}),second=searchResearchRecords({query:'세운상가',limit:2,offset:2});
 assert.ok(first.total>2);assert.equal(first.records.length,2);assert.equal(first.nextOffset,2);
 assert.ok(first.records.every(a=>!second.records.some(b=>b.id===a.id)));
 for(const r of first.records){assert.equal(r.candidate,true);assert.equal(r.usableAsVerifiedEvidence,false);assert.equal(r.imageUrl,null);assert.equal(r.buildingMatch,'unverified');assert.ok(r.observations.every(o=>o.provenance.path.startsWith('research-data/')));}
 const restricted=searchResearchRecords({query:'당인리발전소',limit:12}).records.filter(r=>r.contentUse==='prohibited');
 assert.ok(restricted.length);assert.ok(restricted.every(r=>r.observations.every(o=>!o.description)));
 const local=placeResearchCandidates('종로구','화동','정독도서관');assert.ok(local.total>0);
 assert.equal(placeResearchCandidates('종로구','없는동','없는건물').total,0);
 assert.equal(searchResearchRecords({query:'정독도서관',district:'마포구'}).total,0);
});
test('public MCP exposes query search on existing history tool and includes catalog health alongside entity and building tools',async()=>{
 const request=(method,params)=>new Request('https://test.example/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const list=await (await app.fetch(request('tools/list',{}))).json();assert.equal(list.result.tools.length,11);
 const schema=list.result.tools.find(t=>t.name==='get_place_history').inputSchema;assert.ok(schema.properties.query);assert.ok(schema.anyOf.some(v=>v.required.includes('query')));
 const response=await (await app.fetch(request('tools/call',{name:'get_place_history',arguments:{query:'정독도서관',limit:2}}))).json();
 assert.ok(!response.result.isError);const data=JSON.parse(response.result.content[0].text);assert.ok(data.total>0);assert.equal(data.records.length,2);
 const invalid=await (await app.fetch(request('tools/call',{name:'get_place_history',arguments:{}}))).json();assert.equal(invalid.result.isError,true);
 const health=await (await app.fetch(new Request('https://test.example/health'))).json();assert.equal(health.researchCatalog.contentSha256,researchCatalogStatus.contentSha256);
});
