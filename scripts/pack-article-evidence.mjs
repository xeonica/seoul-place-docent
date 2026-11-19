import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const rows=JSON.parse(gunzipSync(readFileSync(new URL('public/research/seoul-district-collection/articles-index.json.gz',root))).toString('utf8')).rows;
const folder=new URL('public/research/article-evidence/',root);mkdirSync(folder,{recursive:true});
let count=0;
for(const district of new Set(rows.map(row=>row.district))){
 if(!/^[가-힣]+구$/.test(district))throw new Error('Invalid district');
 const compact=rows.filter(row=>row.district===district).map(row=>({id:row.id,title:row.values.자료명||row.label,sourceInstitution:row.values.신문사||null,sourceUrl:row.values.원문URL||null,publishedAt:row.values['신문 발행일']||null,eventDate:row.values.사건일자||row.values['추가 검색어']?.match(/사건_발생일:\s*([^·]+)/)?.[1]?.trim()||null,location:row.values['추가 검색어']?.match(/확인된_장소:\s*([^·]+)/)?.[1]?.trim()||'',file:row.values['조사 CSV']||null,line:row.values['CSV 행']||null,reviewStatus:row.status,rightsStatus:row.values.이용조건||'unknown'}));
 writeFileSync(new URL(district+'.json.gz',folder),gzipSync(JSON.stringify(compact)));count+=compact.length;
}
console.log('Article metadata shards:',count);
