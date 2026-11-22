import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Seoul dong photo coverage contains every listed legal dong and distinguishes missing direct photos from district fallback',()=>{
 const rows=readFileSync(new URL('../outputs/seoul-dong-photo-coverage.csv',import.meta.url),'utf8').trim().split(/\r?\n/);
 assert.equal(rows.length,895);
 const districts=new Set(rows.slice(1).map(line=>line.match(/^"([^"]+)"/)?.[1]));
 assert.equal(districts.size,25);
 assert.equal(rows.slice(1).filter(line=>line.includes('","법정동",')).length,467);
 assert.equal(rows.slice(1).filter(line=>line.includes('","행정동",')).length,427);
 assert.ok(rows.some(line=>line.includes('"강남구","법정동","논현동"')));
 assert.ok(rows.some(line=>line.includes('"성동구","법정동","마장동"')));
 assert.ok(rows.some(line=>line.includes('"성북구","법정동","삼선동3가"')));
 assert.ok(rows.some(line=>line.includes('"성동구","행정동","마장동","마장동"')));
 for(const line of rows.slice(1)){
  assert.match(line,/"HTTP 이미지 응답 확인 · MCP\/UI 미실증"|"아니오"/);
 }
});
