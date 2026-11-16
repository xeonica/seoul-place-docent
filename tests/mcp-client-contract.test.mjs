import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const route=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8');
test('MCP exposes evidence preparation, GPS fallback and mechanical validation',()=>{
 for(const name of ['resolve_photo_location','prepare_place_answer','generate_place_answer','validate_place_answer','get_answer_stats'])assert.ok(route.includes("name: '"+name+"'")||route.includes("name:'"+name+"'"));
 assert.ok(route.includes('mapAddress(input.longitude,input.latitude,env)'));
 assert.ok(route.includes("status:'needs_location'"));assert.ok(route.includes('needsConfirmation:true'));
 assert.equal(route.includes('spend('),false);
 assert.equal(route.includes('beforeRequest'),false);
});
test('grouped history pagination uses the actual scene count',()=>{
 const history=readFileSync(new URL('../lib/mcp-place-history.ts',import.meta.url),'utf8');
 assert.ok(history.includes('nextOffset < story.scenes.length'));
 assert.equal(history.includes('nextOffset < story.total'),false);
});
