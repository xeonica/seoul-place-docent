import {NextRequest,NextResponse} from 'next/server';
import {permittedArchiveImage,MAX_ARCHIVE_IMAGE_BYTES} from '../../../lib/archive-image-delivery';

export const runtime='nodejs';
export async function GET(request:NextRequest){
  const target=permittedArchiveImage(request.nextUrl.searchParams.get('url')||'');
  if(!target)return new NextResponse('Invalid archive image URL',{status:400});
  try{
    const upstream=await fetch(target.href,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'image/jpeg,image/png,image/webp'}});
    if(!upstream.ok||!upstream.body)return new NextResponse('Archive image unavailable',{status:502});
    const contentType=(upstream.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(contentType))return new NextResponse('Unexpected image type',{status:502});
    const size=Number(upstream.headers.get('content-length')||0);
    if(size>MAX_ARCHIVE_IMAGE_BYTES)return new NextResponse('Image too large',{status:413});
    const reader=upstream.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_ARCHIVE_IMAGE_BYTES){await reader.cancel();return new NextResponse('Image too large',{status:413});}chunks.push(value);}
    const result=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    // Refuse HTML or other content masquerading as images.
    const jpeg=result[0]===255&&result[1]===216&&result[2]===255;
    const png=result[0]===137&&result[1]===80&&result[2]===78&&result[3]===71;
    const webp=String.fromCharCode(...result.slice(0,4))==='RIFF'&&String.fromCharCode(...result.slice(8,12))==='WEBP';
    if(!(contentType==='image/jpeg'&&jpeg||contentType==='image/png'&&png||contentType==='image/webp'&&webp))return new NextResponse('Invalid image data',{status:502});
    return new NextResponse(result,{headers:{'Content-Type':contentType,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch{return new NextResponse('Archive image fetch failed',{status:502});}
}
