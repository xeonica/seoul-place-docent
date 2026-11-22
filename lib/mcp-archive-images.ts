import {handleImageProxy} from './image-proxy-handler';
import type {McpContent} from './mcp-protocol';

const maxInlineBytes = 256 * 1024;

export async function archiveImageBlocks(photos: readonly {imageUrl?: string | null; previewUrl?: string | null}[]): Promise<McpContent[]> {
  const results = await Promise.allSettled(photos.slice(0, 2).map(async photo => {
    const url = new URL(photo.previewUrl || photo.imageUrl || '');
    const original = url.pathname === '/img' ? url.searchParams.get('u') : url.href;
    if (!original) return null;

    const proxyRequest = new URL('https://seoul-place-docent-mcp.vercel.app/img');
    proxyRequest.searchParams.set('u', original);
    const response = await handleImageProxy(new Request(proxyRequest));
    if (!response.ok || response.headers.get('content-type') !== 'image/jpeg') return null;
    if (Number(response.headers.get('content-length')) > maxInlineBytes) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxInlineBytes || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return {type:'image', mimeType:'image/jpeg', data:btoa(binary)} as const;
  }));
  return results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}
