import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpMessage, MCP_VERSION, MCP_STANDARD_VERSION, MCP_SUPPORTED_VERSIONS, textResult} from '../lib/mcp-protocol.ts';

const tools = [{name: 'read_records', description: 'Read records', inputSchema: {type: 'object'}}];
const call = (method, params = {}, id = 1) => ({jsonrpc: '2.0', id, method, params});
const execute = async (_name, args) => textResult(args);

test('discovery advertises the Sites protocol and tools capability', async () => {
  const response = await handleMcpMessage(call('server/discover'), tools, execute);
  assert.equal(response.id, 1);
  assert.deepEqual(response.result.supportedVersions, [...MCP_SUPPORTED_VERSIONS]);
  assert.ok(response.result.supportedVersions.includes(MCP_VERSION));
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
test('initialize echoes supported standard client versions and retains Sites compatibility', async () => {
  for (const protocolVersion of ['2025-03-26', '2025-06-18', '2025-11-25', MCP_VERSION]) {
    const response = await handleMcpMessage(call('initialize', {protocolVersion, capabilities: {}, clientInfo: {name: 'client', version: '1.0'}}), tools, execute);
    assert.equal(response.error, undefined);
    assert.equal(response.result.protocolVersion, protocolVersion);
    assert.deepEqual(response.result.capabilities, {tools: {}});
  }
});
test('unknown client versions negotiate a supported standard version instead of failing initialization', async () => {
  const response = await handleMcpMessage(call('initialize', {protocolVersion: '2099-01-01'}), tools, execute);
  assert.equal(response.error, undefined);
  assert.equal(response.result.protocolVersion, MCP_STANDARD_VERSION);
});
test('missing or malformed protocol versions stay invalid', async () => {
  for (const protocolVersion of [undefined, null, 20250326, '', '   ']) {
    assert.equal((await handleMcpMessage(call('initialize', {protocolVersion}), tools, execute)).error.code, -32602);
  }
});
test('a standard client can initialize, notify readiness, and list and call tools', async () => {
  const initialized = await handleMcpMessage(call('initialize', {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'client', version: '1.0'}}), tools, execute);
  assert.equal(initialized.result.protocolVersion, '2025-03-26');
  assert.equal(await handleMcpMessage({jsonrpc: '2.0', method: 'notifications/initialized'}, tools, execute), undefined);
  assert.deepEqual((await handleMcpMessage(call('tools/list'), tools, execute)).result.tools, tools);
  const result = await handleMcpMessage(call('tools/call', {name: 'read_records', arguments: {offset: 1}}), tools, execute);
  assert.deepEqual(JSON.parse(result.result.content[0].text), {offset: 1});
});
