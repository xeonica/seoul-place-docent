import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCsv,buildCatalog} from './research-catalog.mjs';
const root=new URL('../',import.meta.url);
function read(folder){return readdirSync(new URL(folder,root),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?read(folder+e.name+'/'):e.name.endsWith('.csv')?[folder+e.name]:[]);}
const files=read('research-data/').map(path=>{const text=readFileSync(new URL(path,root),'utf8');return {path,sha256:createHash('sha256').update(text).digest('hex'),...parseCsv(text)};});
const catalog=buildCatalog(files);
writeFileSync(new URL('data/research-catalog.json',root),JSON.stringify(catalog)+'\n');
console.log(`Research catalog: ${catalog.meta.inputRows} rows → ${catalog.meta.uniqueSources} source URLs (${catalog.meta.duplicateRows} duplicate observations retained)`);
