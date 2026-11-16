import {env} from '@/lib/runtime-env';
import {readMcpPlaceHistory, type VisitEvidence} from '@/lib/mcp-place-history';
import {auditedCall} from '@/lib/mcp-audit';
import {textResult} from '@/lib/mcp-protocol';
import {createMcpLimiter} from '@/lib/mcp-http';

const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const allowVisit = createMcpLimiter(120, 60000);

async function readToken(request: Request) {
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get('content-length')) > 8192) return null;
  const decoder = new TextDecoder();
  let bytes = 0;
  let input = '';
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return null;
      }
      input += decoder.decode(value,{stream:true});
    }
    const {token} = JSON.parse(input + decoder.decode());
    return typeof token === 'string' && token.length > 0 && token.length <= 6000 ? token : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({error: '요청 출처를 확인할 수 없습니다.'}, {status: 403, headers});
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    return Response.json({error: '주소 선택이 필요합니다.'}, {status: 415, headers});
  }
  if (!allowVisit()) return Response.json({error: '잠시 후 다시 시도해 주세요.'}, {status:429, headers:{...headers,'Retry-After':'60'}});
  const token = await readToken(request);
  if (!token) {
    return Response.json({error: '주소 선택이 필요합니다.'}, {status: 400, headers});
  }
  const result = await auditedCall(env.DB, 'get_place_history', 'unknown', async () => {
    const history = await readMcpPlaceHistory(token, env, 0, 12, false);
    const sources = [...new Map(history.neighborhood.scenes.flatMap(scene => scene.evidence
      .flatMap(source => source.url ? [[source.url, {title: source.title, url: source.url, institution: source.institution}] as const] : []))).values()];
    return textResult({
      mappedRecords: history.mappedRecords, spatial: history.spatial, sources,
      returned: history.neighborhood.scenes.length, available: history.neighborhood.sceneCount,
      neighborhood: {scenes: history.neighborhood.scenes.map(scene => scene.id)},
    });
  });
  if (result.isError) return Response.json({error: '이번 탐방의 자료 조회를 확인하지 못했습니다.'}, {status: 422, headers});
  const data = JSON.parse(result.content[0].text) as Omit<VisitEvidence, 'receipt'>;
  const {mappedRecords, spatial, sources, returned, available} = data;
  return Response.json({mappedRecords, spatial, sources, returned, available, receipt: result._meta} satisfies VisitEvidence, {headers});
}
