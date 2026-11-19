import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/place-answer.ts',import.meta.url),'utf8');
test('client docent guidance emphasizes grounded storytelling without fabricating causal links',()=>{
  for(const phrase of ['서사 우선 해설 원칙','중심 질문 하나','변화의 계기','추론은 추론이라고 밝히고','증명되지 않은 인과관계','꾸며낸 대화·감정·풍경'])assert.ok(source.includes(phrase),phrase);
});
test('narrative guidance keeps client-side generation and mechanical evidence validation',()=>{
  assert.match(source,/serverAiCalls:0/);
  assert.match(source,/export function validateAnswer/);
  assert.match(source,/client-docent-11/);
});

test('archival images must retain their own evidence and source association',()=>{
  for(const phrase of ['사진·출처 일치 규칙','evidenceId','imageUrl·sourceUrl','서로 다른 검색 이미지와 MCP 기록 출처를 짝짓지 마세요','원본 sourceUrl','별도 검색 사진'])assert.ok(source.includes(phrase),phrase);
});
