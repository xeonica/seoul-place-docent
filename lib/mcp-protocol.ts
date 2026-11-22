import {galleryResources,readGalleryResource,withGalleryMeta,type GalleryMode,type GalleryVariant} from './docent-gallery';
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  _meta?: Record<string, unknown>;
};
export type McpContent = {type: 'text'; text: string} | {type: 'image'; mimeType: string; data: string};
export type McpToolResult = {content: McpContent[]; structuredContent?:Record<string,unknown>; isError?: boolean; errorType?:string; _meta?:Record<string,unknown>};
type Execute = (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
export type McpOptions = {gallery?: GalleryMode; variant?: GalleryVariant};

export const MCP_VERSION = '2026-07-28';
export const MCP_LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
export const MCP_SUPPORTED_VERSIONS = [MCP_VERSION, ...MCP_LEGACY_VERSIONS];
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function rpcError(id: string | number | null, code: number, message: string) {
  return {jsonrpc: '2.0', id, error: {code, message}};
}
export function textResult(value: unknown): McpToolResult {
  return {content: [{type: 'text', text: JSON.stringify(value)}]};
}

/** Public, stateless evidence tools; admin data uses a separate authenticated API. */
export async function handleMcpMessage(value: unknown, baseTools: readonly McpTool[], execute: Execute, options: McpOptions = {}) {
  const gallery: GalleryMode = options.gallery ?? 'off';
  const variant: GalleryVariant = options.variant ?? 'full';
  const tools = withGalleryMeta(baseTools, gallery);
  const capabilities = gallery === 'off' ? {tools: {}} : {tools: {}, resources: {}};
  if (!isObject(value)) return rpcError(null, -32600, 'Invalid Request');
  const hasId = Object.prototype.hasOwnProperty.call(value, 'id');
  const id = typeof value.id === 'string' || (typeof value.id === 'number' && Number.isSafeInteger(value.id)) ? value.id : null;
  if (value.jsonrpc !== '2.0' || typeof value.method !== 'string' || (hasId && id === null)) {
    return rpcError(null, -32600, 'Invalid Request');
  }
  if (value.params !== undefined && !isObject(value.params)) {
    return hasId ? rpcError(id, -32602, 'Invalid params') : undefined;
  }
  // Notifications must not execute tools or return JSON-RPC responses.
  if (!hasId) return undefined;
  const params = (value.params ?? {}) as Record<string, unknown>;
  let result: unknown;
  switch (value.method) {
    case 'server/discover':
      result = {
        supportedVersions: MCP_SUPPORTED_VERSIONS,
        _meta: {'io.modelcontextprotocol/serverInfo': {name: 'seoul-place-docent', version: '2.0.0'}},
        instructions: '원본 사진은 extract_photo_location으로 실제 EXIF GPS를 읽고 주소 후보를 확인하세요. 파일이 전달되지 않거나 GPS가 없으면 웹 원본 선택·주소 입력을 안내하고 외관으로 위치를 추측하지 마세요. 주소 입력은 search_place로 조회하고 유일하게 식별된 주소는 즉시 해설하고 모호하면 후보 주소만 표시하세요. prepare_place_answer로 근거를 받은 뒤 호출한 AI가 사진·영상·출처와 시기를 붙여 최종 해설을 작성하세요. 같은 token·question으로 validate_place_answer를 호출할 수 있습니다. 장소 이야기 다음에 동네 이야기와 사진을 배치하고 빈 항목과 후속 질문은 생략하세요. GitHub 조사 후보는 get_place_history의 query로 검색할 수 있으며 research의 미검증 자료를 확정 근거로 승격하지 마세요. 주소가 확인되면 기록 수와 무관하게 호출한 AI가 현장 해설을 완성하고, 관련 있는 기록과 사진을 해설 속에 더하세요. 서버는 모델 API를 호출하지 않습니다.',
        capabilities,
        serverInfo: {name: 'seoul-place-docent', version: '2.0.0'},
      };
      break;
    case 'initialize':
      if (typeof params.protocolVersion !== 'string') return rpcError(id, -32602, 'protocolVersion is required');
      // Legacy initialize negotiates a supported version rather than rejecting older clients.
      const negotiated = MCP_SUPPORTED_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : MCP_LEGACY_VERSIONS[0];
      result = {
        protocolVersion: negotiated,
        instructions: '원본 사진 첨부는 extract_photo_location으로 EXIF GPS를 읽으세요. 파일이 전달되지 않거나 GPS가 없으면 웹에서 원본 선택 또는 주소·실제 GPS 공유를 안내하고 외관으로 위치를 추측하지 마세요. 입력 주소가 하나로 식별되면 바로 prepare_place_answer로 근거를 조회하고 호출한 AI가 사진·영상·출처와 함께 최종 도슨트를 작성하세요. GitHub 조사 후보는 get_place_history의 query로 검색할 수 있으며 research의 미검증 자료를 확정 근거로 승격하지 마세요. 주소가 확인되면 기록 수와 무관하게 호출한 AI가 현장 해설을 완성하고, 관련 있는 기록과 사진을 해설 속에 더하세요. 서버는 모델 API를 호출하지 않습니다.',
        capabilities,
        serverInfo: {name: 'seoul-place-docent', version: '2.0.0'},
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'resources/list':
      result = {resources: galleryResources(gallery, variant)};
      break;
    case 'resources/templates/list':
      // Answered even with the gallery off: some hosts probe it during registration.
      result = {resourceTemplates: []};
      break;
    case 'resources/read': {
      const found = readGalleryResource(params.uri, gallery, variant);
      if (!found) return rpcError(id, -32002, 'Unknown resource');
      result = found;
      break;
    }
    case 'tools/list':
      result = {tools};
      break;
    case 'tools/call':
      if (typeof params.name !== 'string' || !tools.some(tool => tool.name === params.name)) {
        return rpcError(id, -32602, 'Unknown tool');
      }
      if (params.arguments !== undefined && !isObject(params.arguments)) {
        return rpcError(id, -32602, 'Tool arguments must be an object');
      }
      try {
        result = await execute(params.name, (params.arguments ?? {}) as Record<string, unknown>);
      } catch {
        result = {
          content: [{type: 'text', text: '자료 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.'}],
          isError: true,
        };
      }
      break;
    default:
      return rpcError(id, -32601, 'Method not found');
  }
  if(isObject(result)&&(value.method==='server/discover'||isObject(params._meta)&&params._meta['io.modelcontextprotocol/protocolVersion']===MCP_VERSION))result={...result,resultType:'complete',_meta:{...(isObject(result._meta)?result._meta:{}),'io.modelcontextprotocol/serverInfo':{name:'seoul-place-docent',version:'2.0.0'}}};
  return {jsonrpc: '2.0', id, result};
}
