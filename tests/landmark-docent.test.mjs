import assert from 'node:assert/strict';
import test from 'node:test';
import {landmarkStory} from '../lib/landmark-docent.ts';
import {generatePlaceAnswer} from '../lib/place-answer.ts';
import {buildPlaceDocentTourV2} from '../lib/docent-tour-integration.ts';
import {docentTourInstructions} from '../lib/docent-tour-builder.ts';
import {validateDocentTourV2} from '../lib/docent-tour-schema.ts';

test('a bridge without a road address builds a seven-part tour from research records', async () => {
  const {story, address, research} = landmarkStory('성수대교');
  assert.ok(research.total > 0);
  assert.ok(story.scenes.length > 0);
  assert.equal(address.bdNm, '성수대교');
  assert.ok(story.scenes.every(scene => scene.evidence[0].url));
  const years = story.scenes.map(scene => scene.year ?? 9999);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  const packet = await generatePlaceAnswer({address, story, question: '성수대교의 역사를 도슨트로 안내해 주세요.'});
  assert.equal(packet.status, 'ready');
  const tour = buildPlaceDocentTourV2({packet: {...packet, place: {name: '성수대교', records: []}}, placeRecords: [], photos: [], videos: {records: []}, placeEvidenceLinks: {items: []}, regionalHistoryFacts: {records: []}});
  assert.equal(tour.sections.length, 7);
  assert.equal(validateDocentTourV2(tour).valid, true);
  assert.ok(tour.sections.some(section => section.evidenceIds.length > 0));
  const instructions = docentTourInstructions(tour);
  assert.match(instructions, /도입부.*1부.*7부/s);
  assert.match(instructions, /검토 전 자료로 해설에 사용할 수 있습니다/);
  assert.doesNotMatch(instructions, /확정 사실로 쓰지 마세요/);
});

test('an unknown name yields no scenes so the address flow can report not found', () => {
  assert.equal(landmarkStory('존재하지않는장소이름xyz').story.scenes.length, 0);
});
