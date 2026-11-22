import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpMessage, textResult} from '../lib/mcp-protocol.ts';
import {galleryVariant, galleryMode, GALLERY_APP_URI, GALLERY_SKYBRIDGE_URI, GALLERY_APP_MIME, GALLERY_SKYBRIDGE_MIME, GALLERY_HTML} from '../lib/docent-gallery.ts';

const tools = [
  {name: 'show_place_photos', description: 'photos', inputSchema: {type: 'object'}},
  {name: 'search_place', description: 'search', inputSchema: {type: 'object'}},
];
const call = (method, params = {}, id = 1) => ({jsonrpc: '2.0', id, method, params});
const execute = async () => textResult({});
const run = (method, params, gallery) => handleMcpMessage(call(method, params), tools, execute, {gallery});

test('gallery mode: query wins over env, default on, aliases accepted', () => {
  const req = q => new Request('https://docent.test/mcp' + q);
  assert.equal(galleryMode(req(''), undefined), 'on');
  assert.equal(galleryMode(req(''), 'off'), 'off');
  assert.equal(galleryMode(req('?gallery=off'), 'on'), 'off');
  assert.equal(galleryMode(req('?gallery=skybridge'), 'off'), 'skybridge');
  assert.equal(galleryMode(req('?gallery=0'), undefined), 'off');
  assert.equal(galleryMode(req('?gallery=nonsense'), 'app'), 'app');
  assert.equal(galleryMode(null, 'false'), 'off');
});

test('off mode exposes no resources and no tool UI metadata', async () => {
  const init = await run('initialize', {protocolVersion: '2025-06-18'}, 'off');
  assert.deepEqual(init.result.capabilities, {tools: {}});
  assert.deepEqual((await run('resources/list', {}, 'off')).result.resources, []);
  assert.deepEqual((await run('resources/templates/list', {}, 'off')).result, {resourceTemplates: []});
  assert.equal((await run('resources/read', {uri: GALLERY_APP_URI}, 'off')).error.code, -32002);
  for (const tool of (await run('tools/list', {}, 'off')).result.tools) assert.equal(tool._meta, undefined);
});

test('on mode publishes both resources, links both tool keys, and reads exact URIs', async () => {
  const init = await run('initialize', {protocolVersion: '2025-06-18'}, 'on');
  assert.deepEqual(init.result.capabilities, {tools: {}, resources: {}});
  const listed = (await run('resources/list', {}, 'on')).result.resources;
  assert.deepEqual(listed.map(r => [r.uri, r.mimeType]), [[GALLERY_APP_URI, GALLERY_APP_MIME], [GALLERY_SKYBRIDGE_URI, GALLERY_SKYBRIDGE_MIME]]);
  const [prepare, search] = (await run('tools/list', {}, 'on')).result.tools;
  assert.equal(prepare._meta.ui.resourceUri, GALLERY_APP_URI);
  assert.equal(prepare._meta['openai/outputTemplate'], GALLERY_SKYBRIDGE_URI);
  assert.equal(search._meta, undefined);
  for (const resource of listed) {
    const read = (await run('resources/read', {uri: resource.uri}, 'on')).result;
    assert.equal(read.contents.length, 1);
    const [content] = read.contents;
    assert.equal(content.uri, resource.uri);
    assert.equal(content.mimeType, resource.mimeType);
    assert.equal(content.text, GALLERY_HTML);
    assert.ok(content._meta.ui.csp.resourceDomains.includes('https://archive-file.sb.go.kr'));
    assert.ok(content._meta['openai/widgetCSP'].resource_domains.includes('https://archive-file.sb.go.kr'));
  }
  assert.equal((await run('resources/read', {uri: GALLERY_APP_URI + '/'}, 'on')).error.code, -32002);
});

test('single-host modes publish only their own resource', async () => {
  const app = (await run('resources/list', {}, 'app')).result.resources.map(r => r.uri);
  const sky = (await run('resources/list', {}, 'skybridge')).result.resources.map(r => r.uri);
  assert.deepEqual(app, [GALLERY_APP_URI]);
  assert.deepEqual(sky, [GALLERY_SKYBRIDGE_URI]);
  const skyTool = (await run('tools/list', {}, 'skybridge')).result.tools[0];
  assert.equal(skyTool._meta.ui, undefined);
  assert.equal(skyTool._meta['openai/outputTemplate'], GALLERY_SKYBRIDGE_URI);
});

test('gallery HTML is static and never injects markup from data', () => {
  assert.doesNotMatch(GALLERY_HTML, /innerHTML|outerHTML|document\.write|eval\(/);
  assert.doesNotMatch(GALLERY_HTML, /<script[^>]+src=/);
  assert.match(GALLERY_HTML, /ui\/initialize/);
  assert.match(GALLERY_HTML, /openai:set_globals/);
});

test('diagnostic variants change only CSP metadata and HTML', async () => {
  const read = async variant => (await handleMcpMessage(call('resources/read', {uri: GALLERY_SKYBRIDGE_URI}), tools, execute, {gallery: 'skybridge', variant})).result.contents[0];
  const full = await read('full');
  assert.ok(full._meta['openai/widgetCSP'].resource_domains.includes('https://museum.seoul.go.kr:8088'));
  const noport = await read('noport');
  assert.ok(noport._meta['openai/widgetCSP'].resource_domains.every(d => !new URL(d).port));
  assert.ok(noport._meta['openai/widgetCSP'].resource_domains.includes('https://archive-file.sb.go.kr'));
  const proxy = await read('proxy');
  assert.equal(proxy._meta['openai/widgetCSP'].resource_domains.length, 1);
  const nocsp = await read('nocsp');
  assert.equal(nocsp._meta['openai/widgetCSP'], undefined);
  assert.equal(nocsp._meta.ui, undefined);
  assert.equal(nocsp.text, GALLERY_HTML);
  const minimal = await read('minimal');
  assert.equal(minimal._meta['openai/widgetCSP'], undefined);
  assert.ok(minimal.text.length < 300);
  assert.equal(galleryVariant(new Request('https://x.test/mcp?gallery=skybridge&variant=NOPORT')), 'noport');
  assert.equal(galleryVariant(new Request('https://x.test/mcp?variant=bogus')), 'full');
});

test('2026-07-28 requests get CacheableResult fields on discovery, list and read', async () => {
  const meta = {_meta: {'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}}};
  for (const [method, params] of [['server/discover', {}], ['tools/list', {}], ['resources/list', {}], ['resources/templates/list', {}], ['resources/read', {uri: GALLERY_SKYBRIDGE_URI}]]) {
    const r = (await handleMcpMessage(call(method, {...params, ...meta}), tools, execute, {gallery: 'on'})).result;
    assert.equal(r.resultType, 'complete', method);
    assert.equal(typeof r.ttlMs, 'number', method);
    assert.equal(r.cacheScope, 'public', method);
  }
  const call2 = (await handleMcpMessage(call('tools/call', {name: 'search_place', ...meta}), tools, execute, {gallery: 'on'})).result;
  assert.equal(call2.ttlMs, undefined);
  const legacy = (await handleMcpMessage(call('tools/list'), tools, execute, {gallery: 'on'})).result;
  assert.equal(legacy.ttlMs, undefined);
  assert.equal((await handleMcpMessage(call('resources/read', {uri: 'ui://missing', ...meta}), tools, execute, {gallery: 'on'})).error.code, -32602);
  assert.equal((await handleMcpMessage(call('resources/read', {uri: 'ui://missing'}), tools, execute, {gallery: 'on'})).error.code, -32002);
});
