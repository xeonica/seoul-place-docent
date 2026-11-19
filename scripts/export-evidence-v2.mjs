// Extends the existing import, preserving each original observation/claim ID.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const output=process.argv[2];if(!output)throw new Error('NDJSON output path required');
const temporary=output+'.research';
execFileSync(process.execPath,['scripts/export-github-research.mjs',temporary],{stdio:'inherit'});
const rows=readFileSync(temporary,'utf8').trim().split('\n').map(JSON.parse);rmSync(temporary);
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const articleFile='public/research/seoul-district-collection/articles-index.json.gz';
const bytes=readFileSync(articleFile),articles=JSON.parse(gunzipSync(bytes)).rows;
function add(row,file,sha,kind,mediaType,sourceUrl,title,values){
 rows.push({import_row_id:hash(file+':'+sha+':'+row.id),source_commit:commit,source_file:file,source_file_sha256:sha,source_line:0,row_kind:kind,research_id:row.id,original_record_id:row.id,place_id:null,source_url:sourceUrl||null,title:title||row.label||row.id,media_type:mediaType,review_status:row.status||'candidate',rights_status:'unknown',usable_as_verified_evidence:false,original_values:values});
}
for(const row of articles)add(row,articleFile,hash(bytes),'research_observation','article',row.values.원문URL,row.values.자료명,{...row.values,기사요약:undefined,district:row.district});
const documentFile='data/document-research/bundle.json',documentBytes=readFileSync(documentFile),bundle=JSON.parse(documentBytes);
for(const table of ['sources','links','claims','timeline'])for(const row of bundle.tables[table])add(row,documentFile+'#'+table,hash(documentBytes),'document_'+table,'document',row.values.원문URL,row.values.자료명,{...row.values,district:row.district,target_ids:row.targetIds,source_ids:row.sourceIds,evidence_ids:row.evidenceIds});
if(new Set(rows.map(r=>r.import_row_id)).size!==rows.length)throw new Error('Duplicate import row IDs');
writeFileSync(output,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
console.log(JSON.stringify({rows:rows.length,articles:articles.length,sourceCommit:commit}));
