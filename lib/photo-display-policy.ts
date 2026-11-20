/** Self-contained so the exact same gate can run in the sandboxed MCP gallery. */
export function canDisplayVerifiedPhoto(photo:Record<string,unknown>,origins:readonly string[],proxyOrigin:string):boolean{
 if(photo.verificationStatus!=='VERIFIED'||photo.displayable!==true||!photo.sourceRecordId||!photo.mediaId||!photo.license)return false;
 if(typeof photo.imageUrl!=='string'||photo.imageUrl!==photo.displayImageUrl||typeof photo.originalImageUrl!=='string'||photo.sourcePageUrl!==photo.sourceUrl)return false;
 try{
  const source=new URL(String(photo.sourcePageUrl));const original=new URL(photo.originalImageUrl);const display=new URL(photo.imageUrl);
  if(source.protocol!=='https:'||source.username||source.password||original.protocol!=='https:'||original.username||original.password||!origins.includes(original.origin))return false;
  if(display.username||display.password||display.protocol!=='https:')return false;
  if(display.origin===proxyOrigin&&display.pathname==='/img'){const target=display.searchParams.get('u'),bound=new URL(String(target));return bound.protocol==='https:'&&!bound.username&&!bound.password&&origins.includes(bound.origin)&&(target===original.href||Array.isArray(photo.alternateUrls)&&photo.alternateUrls.includes(target));}
  return origins.includes(display.origin)&&(display.href===original.href||Array.isArray(photo.alternateUrls)&&photo.alternateUrls.includes(display.href));
 }catch{return false;}
}
