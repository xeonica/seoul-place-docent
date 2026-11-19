/** Only public archive image endpoints, never arbitrary user-provided hosts. */
export const ARCHIVE_IMAGE_HOSTS=new Set(['data.si.re.kr']);
export const MAX_ARCHIVE_IMAGE_BYTES=5_000_000;
export function permittedArchiveImage(raw:string):URL|null{
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!ARCHIVE_IMAGE_HOSTS.has(url.hostname.toLowerCase()))return null;
    if(!/^\\/sites\\/default\\/files\\/photos(?:\\d+)?\\/[a-zA-Z0-9_-]+\\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname))return null;
    if(url.search||url.hash)return null;
    return url;
  }catch{return null;}
}
export function imageDeliveryUrl(imageUrl:string,terms:string):string|null{
  // The upstream provider requires per-item license confirmation; no proxy for unclear rights.
  if(!/(?:CC BY 4\\.0|공공누리 제1유형)/i.test(terms))return null;
  const url=permittedArchiveImage(imageUrl);
  return url?'/api/archive-image?url='+encodeURIComponent(url.href):null;
}
