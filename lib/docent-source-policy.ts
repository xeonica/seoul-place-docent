import raw from '../data/docent-source-holds.json';
const holds:Record<string,{status:string;sourceUrl:string;checkedAt:string;reason:string;basis:string}>=raw;
export function heldDocentSource(id:string){return holds[id]||null;}
