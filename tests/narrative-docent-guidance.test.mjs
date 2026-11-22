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
  assert.match(source,/client-docent-12/);
});

test('archival images must retain their own evidence and source association',()=>{
  for(const phrase of ['사진·출처 일치 규칙','evidenceId','imageUrl·sourceUrl','서로 다른 검색 이미지와 MCP 기록 출처를 짝짓지 마세요','원본 sourceUrl','별도 검색 사진','웹 검색 참고 사진','MCP 기록이 아닌 웹 검색 사진'])assert.ok(source.includes(phrase),phrase);
  assert.ok(!source.includes('해당 장면에서 기본 이미지 표시 기능'),'웹 사진을 본문 장면에 섞으라는 옛 지침이 남아 있음');
});

test('photo guidance interleaves cards after each part instead of capping or batching them',()=>{
  for(const phrase of ['문단(부)을 하나 쓸 때마다','문단 쓰기 → show_place_photos → 다음 문단 쓰기','몰아서 보여 주지 말고','사진이 없는 부는 호출하지 마세요'])assert.ok(source.includes(phrase),phrase);
  assert.ok(!source.includes('3~4회 이내'));
});
