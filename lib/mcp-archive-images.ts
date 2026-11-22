import {handleImageProxy} from './image-proxy-handler';
import type {McpContent} from './mcp-protocol';

/** Every photo in visuals.photos (max 8) may be sent inline, within per-image and total byte budgets. */
export const MAX_INLINE_IMAGES = 8;
const maxInlineBytes = 300 * 1024;
const maxTotalBytes = 1536 * 1024;

type InlinePhoto = {imageUrl?: string | null; previewUrl?: string | null; title?: string | null; caption?: string | null; date?: string | null; evidenceId?: string | null};

const signatures: [string, (b: Uint8Array) => boolean][] = [
  ['image/jpeg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['image/webp', b => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'],
  ['image/gif', b => String.fromCharCode(...b.slice(0, 4)) === 'GIF8'],
];

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

async function fetchPreview(photo: InlinePhoto) {
  const url = new URL(photo.previewUrl || photo.imageUrl || '');
  const original = url.pathname === '/img' ? url.searchParams.get('u') : url.href;
  if (!original) return null;
  const proxyRequest = new URL('https://seoul-place-docent-mcp.vercel.app/img');
  proxyRequest.searchParams.set('u', original);
  const response = await handleImageProxy(new Request(proxyRequest));
  if (!response.ok || Number(response.headers.get('content-length')) > maxInlineBytes) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxInlineBytes) return null;
  // Trust the bytes, not the upstream header: archives sometimes mislabel types.
  const mimeType = signatures.find(([, test]) => test(bytes))?.[0];
  return mimeType ? {bytes, mimeType} : null;
}

/**
 * Fetch archive previews in parallel and return them in photo order, each preceded by a short
 * caption so the calling AI can match every image to its record. Images that fail, are too large,
 * or would push the response past the total budget are skipped; their links stay in visuals.photos.
 */
export async function archiveImageBlocks(photos: readonly InlinePhoto[]): Promise<McpContent[]> {
  const selected = photos.slice(0, MAX_INLINE_IMAGES);
  const results = await Promise.allSettled(selected.map(fetchPreview));
  const blocks: McpContent[] = [];
  let total = 0, index = 0;
  for (const [i, result] of results.entries()) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    if (total + result.value.bytes.length > maxTotalBytes) continue;
    total += result.value.bytes.length;
    index += 1;
    const photo = selected[i];
    const label = photo.caption || [photo.date, photo.title].filter(Boolean).join(' · ') || '기록 사진';
    blocks.push({type: 'text', text: `사진 ${index}: ${label}${photo.evidenceId ? ` (evidenceId: ${photo.evidenceId})` : ''}`});
    blocks.push({type: 'image', mimeType: result.value.mimeType, data: toBase64(result.value.bytes)});
  }
  return blocks;
}
