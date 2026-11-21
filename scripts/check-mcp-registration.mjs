import assert from 'node:assert/strict';

const endpoint = process.argv[2];
assert(endpoint, 'Usage: node scripts/check-mcp-registration.mjs https://example.com/mcp');

const protocolVersion = '2025-11-25';
const expectedTools = [
  'extract_photo_location', 'resolve_photo_location', 'prepare_place_answer',
  'validate_place_answer', 'search_place', 'get_place_history',
  'generate_place_answer', 'get_answer_stats', 'get_archive_stats',
];
let nextId = 0;
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

async function request(method, params, {notification = false, initialized = false} = {}) {
  const id = notification ? undefined : ++nextId;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {...headers, ...(initialized ? {'MCP-Protocol-Version': protocolVersion} : {})},
    body: JSON.stringify({jsonrpc: '2.0', id, method, params}),
    signal: AbortSignal.timeout(25_000),
  });
  assert.equal(response.status, notification ? 202 : 200, method);
  if (notification) {
    assert.equal(await response.text(), '', method);
    return;
  }
  assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/i);
  const body = await response.json();
  assert.equal(body.jsonrpc, '2.0', method);
  assert.equal(body.id, id, method);
  assert.equal(body.error, undefined, method);
  assert(body.result, method);
  return body.result;
}

const init = await request('initialize', {
  protocolVersion,
  capabilities: {},
  clientInfo: {name: 'docent-registration-check', version: '1.0.0'},
});
assert.equal(init.protocolVersion, protocolVersion);
assert(init.serverInfo?.name && init.capabilities?.tools);
await request('notifications/initialized', {}, {notification: true, initialized: true});

const {tools} = await request('tools/list', {}, {initialized: true});
assert.deepEqual(tools.map(tool => tool.name).sort(), expectedTools.sort());
for (const tool of tools) {
  assert(tool.description?.trim(), tool.name);
  assert.equal(tool.inputSchema.type, 'object', tool.name);
  assert(tool.inputSchema.properties && !Array.isArray(tool.inputSchema.properties), tool.name);
  for (const field of tool.inputSchema.required ?? []) {
    assert(Object.hasOwn(tool.inputSchema.properties, field), tool.name + ': missing property ' + field);
  }
  assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
}

const fileTool = tools.find(tool => tool.name === 'extract_photo_location');
assert.deepEqual(fileTool._meta['openai/fileParams'], ['file']);
for (const field of ['download_url', 'file_id', 'mime_type', 'file_name']) {
  assert.equal(fileTool.inputSchema.properties.file.properties[field].type, 'string', field);
}
for (const name of ['prepare_place_answer', 'generate_place_answer']) {
  const tool = tools.find(item => item.name === name);
  const uri = tool._meta.ui.resourceUri;
  assert.match(uri, /^ui:\/\//);
  assert.equal(tool._meta['openai/outputTemplate'], uri);
  const resource = await request('resources/read', {uri}, {initialized: true});
  assert(resource.contents?.some(item => item.uri === uri && /mcp-app/.test(item.mimeType) && item.text), name);
}

const incompatible = tools.flatMap(tool =>
  ['anyOf', 'oneOf', 'allOf'].filter(key => Object.hasOwn(tool.inputSchema, key))
    .map(key => tool.name + ': ' + key),
);
assert.deepEqual(incompatible, [], 'Plain root object registration profile');
console.log('Initialization, 9 tool descriptors, and gallery resource passed.');
