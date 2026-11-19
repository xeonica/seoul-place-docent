import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const proofs={};
const key=raw=>{const u=new URL(raw);u.searchParams.sort();return u.href;};
function rows(path){const bytes=readFileSync(new URL(path,root));return {rows:bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse),provenance:path+'#sha256='+createHash('sha256').update(bytes).digest('hex')};}
const museum=rows('data/seoul-museum/raw.jsonl');
for(const row of museum.rows){
 if(!row.ok||row.kogl!==1||!row.fileId||!row.fileSn)continue;
 const source=`https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=${row.ctgryId}&type=${row.type}&upperNodeId=${row.upperNodeId}&fileSn=${row.fileSn}&fileId=${row.fileId}`;
 const image=`https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?fileSn=${row.fileSn}&fileId=${row.fileId}&w=800&h=800`;
 proofs[key(source)]={title:row.title,date:row.date,provider:'서울역사박물관',sourceRecordId:row.fileId,mediaId:row.fileId+':'+row.fileSn,sourcePageUrl:source,originalImageUrl:image,displayImageUrls:[image],license:'공공누리 제1유형(출처표시)',displayAllowed:true,basis:'provider_identifiers',provenance:museum.provenance};
}
const sb=rows('data/seongbuk-archive/raw.jsonl');
for(const row of sb.rows){
 if(!row.ok||!row.image||!/공공누리\s*제?\s*1|CC\s*BY(?![^;]*NC)/i.test(row.license||''))continue;
 const source='https://archive.sb.go.kr/item/'+row.id;
 proofs[key(source)]={title:row.title,date:row.date,provider:source.includes('archive.sb.go.kr')?'성북마을아카이브':'서울기록원',sourceRecordId:String(row.id),mediaId:new URL(row.image).pathname,sourcePageUrl:source,originalImageUrl:row.image,displayImageUrls:[row.image],license:row.license,displayAllowed:true,basis:'source_page',provenance:sb.provenance};
}
const archives=rows('data/seoul-archives/raw.jsonl');
for(const row of archives.rows){
 // The list card thumbnail is not proof of identity with the detail image.
 // Use only the exact image extracted from this record's detail page. Do not
 // infer that 450_* and 2000_* filenames denote the same asset.
 if(!row.ok||!row.image||row.access!=='공개'||row.use!=='제한없음'||row.useNote)continue;
 const source='https://archives.seoul.go.kr/item/'+row.id;
 proofs[key(source)]={title:row.title,date:row.date,provider:source.includes('archive.sb.go.kr')?'성북마을아카이브':'서울기록원',sourceRecordId:String(row.id),mediaId:new URL(row.image).pathname,sourcePageUrl:source,originalImageUrl:row.image,displayImageUrls:[row.image],license:'공개 · 이용유형 제한없음',displayAllowed:true,basis:'source_page',provenance:archives.provenance};
}
writeFileSync(new URL('data/photo-asset-proofs.json',root),JSON.stringify(proofs)+'\n');
console.log('Photo source-asset proofs:',Object.keys(proofs).length);
