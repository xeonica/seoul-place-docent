import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/docent-scene-connections.ts',import.meta.url),'utf8');
const answer=readFileSync(new URL('../lib/place-answer.ts',import.meta.url),'utf8');
test('links must have distinct evidence ids, dated shared subjects, and candidate status',()=>{
  for(const text of ['a.id===b.id','a.year===b.year','matches(s,term)','fromEvidenceId:a.id','toEvidenceId:b.id',"verification:'candidate_only'"])assert.ok(source.includes(text),text);
});
test('calling AI receives links without claiming historical causation',()=>{
  assert.match(answer,/sceneConnections:sceneConnections\(scenes,input.address.bdNm\)/);
  assert.match(answer,/장소 동일성·건물 존속·변화의 원인/);
  assert.match(answer,/serverAiCalls:0/);
});
