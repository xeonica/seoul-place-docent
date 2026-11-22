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

/**
 * Drop JPEG metadata segments that do not affect the picture. Some archive thumbnails carry a
 * ~700 KB ICC profile (APP2) around ~50 KB of image data, which alone pushes them past the
 * inline budget. Keeps APP0 (JFIF) and APP14 (Adobe, needed to decode CMYK/YCCK correctly) and
 * every table/frame segment; removes APP1–APP13, APP15 and comments. Malformed input is
 * returned unchanged.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0xda) { kept.push(bytes.subarray(i)); break; } // start of scan: copy the rest
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) return bytes;
    const droppable = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!droppable) kept.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  if (kept.length < 2 || kept.at(-1)![1] !== 0xda) return bytes;
  const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of kept) { out.set(part, offset); offset += part.length; }
  return out;
}

async function fetchPreview(photo: InlinePhoto) {
  const url = new URL(photo.previewUrl || photo.imageUrl || '');
  const original = url.pathname === '/img' ? url.searchParams.get('u') : url.href;
  if (!original) return null;
  const proxyRequest = new URL('https://seoul-place-docent-mcp.vercel.app/img');
  proxyRequest.searchParams.set('u', original);
  // The proxy already caps downloads at 5 MB; oversized JPEGs may still fit once metadata is gone.
  const response = await handleImageProxy(new Request(proxyRequest));
  if (!response.ok) return null;
  let bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
  // Trust the bytes, not the upstream header: archives sometimes mislabel types.
  const mimeType = signatures.find(([, test]) => test(bytes))?.[0];
  if (!mimeType) return null;
  if (bytes.length > maxInlineBytes && mimeType === 'image/jpeg') bytes = stripJpegMetadata(bytes);
  return bytes.length > maxInlineBytes ? null : {bytes, mimeType};
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
