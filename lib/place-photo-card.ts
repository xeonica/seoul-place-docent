import {z} from 'zod';
import {imageProxyOrigin, isAllowedImageUrl, toProxyUrl} from './image-proxy';
import type {McpTool, McpToolResult} from './mcp-protocol';

/**
 * show_place_photos: puts 1–3 archive photos as a card at the point in the answer where the AI
 * calls it. MCP Apps hosts render a tool's UI where the call happens, so calling this right after
 * the paragraph that discusses a photo interleaves photos with the docent text instead of showing
 * one gallery above the whole answer.
 *
 * The AI copies entries from prepare_place_answer's visuals.photos. Image URLs are accepted only
 * through this server's /img proxy or directly from an allowlisted archive origin, and are always
 * re-emitted as proxy URLs; links must be https. Nothing else is fetched here.
 */
export const SHOW_PLACE_PHOTOS = 'show_place_photos';

const MAX_PHOTOS = 3;
const text = (max: number) => z.string().trim().min(1).max(max);
const photoSchema = z.object({
  imageUrl: text(2000),
  title: text(200),
  sourceUrl: text(2000),
  date: z.string().trim().max(60).optional(),
  credit: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(300).optional(),
  relationNote: z.string().trim().max(300).optional(),
  evidenceId: z.string().trim().max(200).optional(),
}).strict();
const inputSchema = z.object({photos: z.array(photoSchema).min(1).max(MAX_PHOTOS)}).strict();

export const showPlacePhotosTool: McpTool = {
  name: SHOW_PLACE_PHOTOS,
  description: '해설 본문 중간에 기록 사진 카드를 넣습니다. 사진을 설명하는 문단을 쓴 직후 호출하면 그 자리에 사진이 표시됩니다. 해설을 다 쓴 뒤 한꺼번에 호출하지 말고 문단(부)마다 그 뒤에서 호출하세요. prepare_place_answer 결과의 visuals.photos 항목(imageUrl·title·sourceUrl·date·credit·relationNote·evidenceId)을 바꾸지 말고 그대로 1~2장씩 넘기세요. 같은 사진을 두 번 넣지 말고, 본문에 이미지 마크다운을 쓰지 마세요. 이 도구는 MCP 기록 사진 전용입니다. 웹 검색으로 찾은 사진은 넘기지 말고 해설 끝의 \'웹 검색 참고 사진\' 별도 섹션에 따로 표시하세요.',
  inputSchema: {
    type: 'object',
    properties: {
      photos: {
        type: 'array', minItems: 1, maxItems: MAX_PHOTOS,
        items: {
          type: 'object',
          properties: {
            imageUrl: {type: 'string', maxLength: 2000},
            title: {type: 'string', maxLength: 200},
            sourceUrl: {type: 'string', maxLength: 2000},
            date: {type: 'string', maxLength: 60},
            credit: {type: 'string', maxLength: 200},
            caption: {type: 'string', maxLength: 300},
            relationNote: {type: 'string', maxLength: 300},
            evidenceId: {type: 'string', maxLength: 200},
          },
          required: ['imageUrl', 'title', 'sourceUrl'],
          additionalProperties: false,
        },
      },
    },
    required: ['photos'],
    additionalProperties: false,
  },
  annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
};

/** Returns the archive original behind a proxy or archive URL, or null if it is not allowed. */
function archiveOriginal(value: string): string | null {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:') return null;
  if (url.origin === imageProxyOrigin() && url.pathname === '/img') {
    const original = url.searchParams.get('u');
    return original && isAllowedImageUrl(original) ? original : null;
  }
  return isAllowedImageUrl(url.href) ? url.href : null;
}

function httpsUrl(value: string): string | null {
  const url = URL.parse(value);
  return url && url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
}

export function showPlacePhotos(args: Record<string, unknown>): McpToolResult {
  const {photos} = inputSchema.parse(args);
  const accepted = [];
  const rejected: string[] = [];
  for (const photo of photos) {
    const original = archiveOriginal(photo.imageUrl);
    const sourceUrl = httpsUrl(photo.sourceUrl);
    if (!original || !sourceUrl) { rejected.push(photo.title); continue; }
    accepted.push({
      ...photo,
      imageUrl: toProxyUrl(imageProxyOrigin(), original),
      alternateUrls: [original],
      sourceUrl,
    });
  }
  const shown = accepted.map((p, i) => `${i + 1}. ${[p.date, p.title, p.credit].filter(Boolean).join(' · ')}`).join('\n');
  const lines = [
    accepted.length ? `본문의 이 위치에 사진 ${accepted.length}장을 카드로 넣었습니다.\n${shown}` : '표시할 수 있는 사진이 없습니다.',
    accepted.length ? '카드에 날짜·소장기관·원문 링크가 함께 보이니 본문에서 같은 사진을 다시 나열하지 마세요. 사진 카드를 지원하지 않는 화면에서는 사용자가 사진을 볼 수 없으므로 본문 캡션 옆에 원문 링크를 남겨 두세요. 이어서 다음 문단(부)을 쓰고, 그 부에 연결된 사진이 있으면 그 직후에 다시 show_place_photos를 호출하세요. 남은 사진을 해설 끝에 몰아서 호출하지 마세요.' : '',
    rejected.length ? `허용되지 않은 이미지·원문 주소라서 제외한 사진: ${rejected.join(', ')}. visuals.photos의 값을 그대로 넘기세요. 웹 검색 사진은 이 도구로 표시할 수 없으니 해설 끝 '웹 검색 참고 사진' 별도 섹션에서 보여 주세요.` : '',
  ].filter(Boolean);
  return {
    content: [{type: 'text', text: lines.join('\n')}],
    structuredContent: {photos: accepted, rejected: rejected.length},
  };
}
