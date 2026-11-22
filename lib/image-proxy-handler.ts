import {isAllowedImageUrl} from './image-proxy';

const maxImageBytes = 5 * 1024 * 1024;
const corsHeaders = {'Access-Control-Allow-Origin': '*'};
const allowedMethods = 'GET, HEAD, OPTIONS';

/** Some official archive CDNs omit Content-Type; accept only recognizable raster bytes in that case. */
function sniffRasterMime(bytes:Uint8Array):string|null{
  const starts=(...values:number[])=>values.every((value,index)=>bytes[index]===value);
  if(starts(0xff,0xd8,0xff))return 'image/jpeg';
  if(starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return 'image/png';
  if(starts(0x47,0x49,0x46,0x38)&&(bytes[4]===0x37||bytes[4]===0x39)&&bytes[5]===0x61)return 'image/gif';
  if(starts(0x52,0x49,0x46,0x46)&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return 'image/webp';
  if(starts(0x42,0x4d))return 'image/bmp';
  if(starts(0x49,0x49,0x2a,0x00)||starts(0x4d,0x4d,0x00,0x2a))return 'image/tiff';
  if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(4,8))==='ftyp'&&String.fromCharCode(...bytes.subarray(8,12)).startsWith('avif'))return 'image/avif';
  return null;
}

export async function handleImageProxy(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: {
      ...corsHeaders, Allow: allowedMethods, 'Access-Control-Allow-Methods': allowedMethods,
    }});
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {status: 405, headers: {...corsHeaders, Allow: allowedMethods}});
  }

  const original = new URL(request.url).searchParams.get('u');
  if (!original || !isAllowedImageUrl(original)) {
    return new Response(null, {status: 400, headers: corsHeaders});
  }

  const badGateway = () => new Response(null, {status: 502, headers: corsHeaders});
  try {
    // Use GET for both methods so HEAD checks the same bytes and size limit as GET.
    const upstream = await fetch(original, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        Referer: 'https://museum.seoul.go.kr/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      },
    });
    const suppliedType = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase()||'';
    const maySniff=!suppliedType||suppliedType==='application/octet-stream'||suppliedType==='binary/octet-stream';
    if (!upstream.ok || (!suppliedType.startsWith('image/')&&!maySniff)
        || !upstream.body || Number(upstream.headers.get('content-length')) > maxImageBytes) {
      await upstream.body?.cancel();
      return badGateway();
    }

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxImageBytes) {
        await reader.cancel();
        return badGateway();
      }
      chunks.push(value);
    }

    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const contentType=maySniff?sniffRasterMime(body):suppliedType;
    if(!contentType)return badGateway();
    const headers = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Length': String(length),
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
      // Disable active content if an upstream SVG is opened as a document.
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    };
    if (request.method === 'HEAD') return new Response(null, {headers});
    return new Response(body, {headers});
  } catch {
    return badGateway();
  }
}
