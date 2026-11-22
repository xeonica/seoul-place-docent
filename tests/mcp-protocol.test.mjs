import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpMessage, MCP_VERSION, MCP_SUPPORTED_VERSIONS, textResult} from '../lib/mcp-protocol.ts';

const tools = [{name: 'read_records', description: 'Read records', inputSchema: {type: 'object'}}];
const call = (method, params = {}, id = 1) => ({jsonrpc: '2.0', id, method, params});
const execute = async (_name, args) => textResult(args);

test('discovery advertises the Sites protocol and tools capability', async () => {
  const response = await handleMcpMessage(call('server/discover'), tools, execute);
  assert.equal(response.id, 1);
  assert.deepEqual(response.result.supportedVersions, MCP_SUPPORTED_VERSIONS);
  // Resources were dropped with the retired gallery; tools are the only capability.
  assert.deepEqual(response.result.capabilities, {tools: {}});
});
test('tools are discoverable and calls return MCP content blocks', async () => {
  const listed = await handleMcpMessage(call('tools/list'), tools, execute);
  assert.deepEqual(listed.result.tools, tools);
  const response = await handleMcpMessage(call('tools/call', {name: 'read_records', arguments: {offset: 6}}, 'request-2'), tools, execute);
  assert.equal(response.id, 'request-2');
  assert.deepEqual(JSON.parse(response.result.content[0].text), {offset: 6});
});
test('invalid envelopes and unknown methods return JSON-RPC errors', async () => {
  for (const input of [null, [], 'text', {jsonrpc: '1.0', id: 1, method: 'tools/list'}, call('tools/list', {}, {})]) {
    assert.equal((await handleMcpMessage(input, tools, execute)).error.code, -32600);
  }
  assert.equal((await handleMcpMessage(call('missing'), tools, execute)).error.code, -32601);
  assert.equal((await handleMcpMessage(call('tools/list', []), tools, execute)).error.code, -32602);
});
test('notifications never execute tools or return a response', async () => {
  let calls = 0;
  const response = await handleMcpMessage({jsonrpc: '2.0', method: 'tools/call', params: {name: 'read_records'}}, tools, async () => {calls++; return textResult({});});
  assert.equal(response, undefined);
  assert.equal(calls, 0);
});
test('unknown tools and non-object arguments are rejected before execution', async () => {
  let calls = 0;
  const run = async () => {calls++; return textResult({});};
  assert.equal((await handleMcpMessage(call('tools/call', {name: 'missing'}), tools, run)).error.code, -32602);
  for (const args of [null, [], 'text']) {
    assert.equal((await handleMcpMessage(call('tools/call', {name: 'read_records', arguments: args}), tools, run)).error.code, -32602);
  }
  assert.equal(calls, 0);
});
test('unexpected tool failures are safe MCP errors without internal exception text', async () => {
  const response = await handleMcpMessage(call('tools/call', {name: 'read_records'}), tools, async () => {throw new Error('secret database details');});
  assert.equal(response.result.isError, true);
  assert.equal(JSON.stringify(response).includes('secret database details'), false);
});
test('initialize negotiates supported legacy versions and supplies client AI instructions', async () => {
  assert.equal((await handleMcpMessage(call('initialize', {protocolVersion: MCP_VERSION}), tools, execute)).result.protocolVersion, MCP_VERSION);
  for(const version of ['2025-11-25','2025-06-18','2025-03-26']){
    const r=await handleMcpMessage(call('initialize',{protocolVersion:version}),tools,execute);
    assert.equal(r.result.protocolVersion,version);assert.ok(r.result.instructions.includes('호출한 AI'));
  }
  assert.equal((await handleMcpMessage(call('initialize', {protocolVersion: 'unsupported'}), tools, execute)).result.protocolVersion, '2025-11-25');
  assert.equal((await handleMcpMessage(call('initialize'), tools, execute)).error.code,-32602);
});
