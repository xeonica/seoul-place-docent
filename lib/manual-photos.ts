import {trustedImageHost,type PhotoResearchItem} from './photo-research';
/**
 * Hand-registered photos (data/manual-photos.json). One entry = one photo.
 * An entry is shown only when allowDisplay is true AND it names an https image, an https source page and its license/terms of use.
 */
export type ManualPhoto={district:string;dong?:string;title:string;date?:string;imageUrl:string;sourceUrl:string;institution:string;credit?:string;license:string;description?:string;allowDisplay?:boolean};
const https=(v:unknown)=>{if(typeof v!=='string')return null;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function manualPhotoItems(entries:unknown,prefix='manual'):PhotoResearchItem[]{
 if(!Array.isArray(entries))return [];
 const out:PhotoResearchItem[]=[];
 entries.forEach((raw,index)=>{
  const e=raw as Partial<ManualPhoto>;if(!e||typeof e!=='object'||e.allowDisplay!==true)return;
  const image=https(e.imageUrl),source=https(e.sourceUrl);
  const text=(v:unknown)=>typeof v==='string'?v.trim():'';
  if(!image||!source||!text(e.district)||!text(e.title)||!text(e.license)||!text(e.institution))return;
  if(!/\.(?:avif|gif|jpe?g|png|webp|tmb)$/i.test(new URL(image).pathname)&&!trustedImageHost(image))return;
  const dong=text(e.dong);
  out.push({id:prefix+'-'+index,batchId:prefix,district:text(e.district),dong,dataRow:index+1,collectionScope:dong?'dong':'district',recordType:'visual',mediaType:'사진',correctionOf:null,correctionIds:[],
   sourceUrl:source,sourceKey:prefix+':'+source,sourceLinkType:prefix==='manual'?'manual':'record',previewUrl:image,provider:text(e.institution),reviewStatus:prefix==='manual'?'직접 등록':'자동 수집',relation:dong?'동네':'자치구',scope:dong?'동네':'자치구',candidate:false,conflictMentioned:false,sameSourceCount:1,samePreviewCount:1,
   values:{'자료명':text(e.title),'내용설명':text(e.description)||text(e.title),'역사적대상시기':text(e.date)||'시기 미상','제공기관·채널':text(e.institution),'필수출처표시문구':text(e.credit)||text(e.institution),'이용조건':text(e.license),'사이트표시가능여부':'가능','썸네일표시가능여부':'가능'}});
 });
 return out;
}
