import {isRegisteredPhotoUrl} from './photo-proof-index';
import {isAllowedImageUrl} from './image-proxy';

const maxImageBytes = 5 * 1024 * 1024;
const corsHeaders = {'Access-Control-Allow-Origin': '*'};
const allowedMethods = 'GET, HEAD, OPTIONS';

export async function handleImageProxy(request: Request, authorize:(url:string)=>boolean=isRegisteredPhotoUrl): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: {
      ...corsHeaders, Allow: allowedMethods, 'Access-Control-Allow-Methods': allowedMethods,
    }});
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {status: 405, headers: {...corsHeaders, Allow: allowedMethods}});
  }

  const original = new URL(request.url).searchParams.get('u');
  if (!original || !isAllowedImageUrl(original)||!authorize(original)) {
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
    const contentType = upstream.headers.get('content-type');
    if (!upstream.ok || !['image/jpeg','image/png','image/webp','image/gif'].includes((contentType||'').split(';')[0].toLowerCase())
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

    const headers = {
      ...corsHeaders,
      'Content-Type': contentType!,
      'Content-Length': String(length),
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
      // Disable active content if an upstream SVG is opened as a document.
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    };

    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const type=(contentType||'').split(';')[0].toLowerCase();
    const valid=type==='image/jpeg'&&body[0]===255&&body[1]===216&&body[2]===255
      ||type==='image/png'&&body[0]===137&&body[1]===80&&body[2]===78&&body[3]===71
      ||type==='image/webp'&&String.fromCharCode(...body.slice(0,4))==='RIFF'&&String.fromCharCode(...body.slice(8,12))==='WEBP'
      ||type==='image/gif'&&/^GIF8[79]a$/.test(String.fromCharCode(...body.slice(0,6)));
    if(!valid)return badGateway();
    return new Response(request.method==='HEAD'?null:body, {headers});
  } catch {
    return badGateway();
  }
}
