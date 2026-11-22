import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'outputs', 'seoul-125-address-validation.csv');
const previousVerifiedSnapshot = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'seoul-phase-c2-verified-baseline.json'), 'utf8').replace(/^\uFEFF/, ''));
const districts = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구',
  '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구',
  '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구',
];
const placeTypes = ['apartment', 'market', 'school', 'historic_place', 'public_building'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  const [headers, ...data] = rows;
  return data.filter((cells) => cells.length === headers.length).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), cells[index]])),
  );
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));

test('서울 25개 구에 5개 유형씩 125개 슬롯을 유지한다', () => {
  assert.equal(rows.length, 125);
  for (const district of districts) {
    for (const placeType of placeTypes) {
      assert.equal(rows.filter((row) => row.district === district && row.place_type === placeType).length, 1,
        `${district}/${placeType} 슬롯은 정확히 하나여야 함`);
    }
  }
});

test('공식 확인 표본은 출처와 행 위치, 확인 날짜를 추적할 수 있다', () => {
  const verified = rows.filter((row) => row.address_source_verified === 'yes');
  assert.equal(verified.length, 73);
  for (const previous of previousVerifiedSnapshot) {
    const current = rows.find((row) => row.target_id === previous.target_id);
    assert.equal(current?.address_source_verified, 'yes', `${previous.target_id}: 기준 62건을 보존해야 함`);
    for (const field of ['place_name', 'road_address', 'jibun_address', 'official_record_id', 'official_record_url']) {
      assert.equal(current[field], previous[field], `${previous.target_id}: 기준 ${field} 값 보존`);
    }
  }
  for (const row of verified) {
    assert.equal(row.address_status, 'official_address_verified');
    assert.ok(row.place_name, `${row.target_id}: 장소명이 비어 있음`);
    assert.ok(row.road_address || row.jibun_address, `${row.target_id}: 공식 도로명·지번 주소가 모두 비어 있음`);
    assert.ok(row.official_dataset, `${row.target_id}: 공식 데이터셋명이 비어 있음`);
    assert.ok(row.official_record_url, `${row.target_id}: 공식 원문 URL이 비어 있음`);
    assert.ok(row.source_row_locator, `${row.target_id}: 원문 내부 행 식별자가 비어 있음`);
    assert.match(row.address_verified_at, /^2026-11-22$/);
    const officialAddress = row.road_address || row.jibun_address;
    assert.ok(officialAddress.includes(`서울특별시 ${row.district}`),
      `${row.target_id}: 주소와 자치구가 일치하지 않음`);
  }
});

test('공식 미확인 후보는 검증 상태를 올리지 않는다', () => {
  for (const row of rows.filter((entry) => entry.address_source_verified !== 'yes')) {
    assert.notEqual(row.address_status, 'official_address_verified', row.target_id);
  }
});

test('유형별 주소 확인 수와 미확인 수를 실제 CSV에서 집계한다', () => {
  const expected = { apartment: 15, market: 4, school: 11, historic_place: 18, public_building: 25 };
  for (const [placeType, count] of Object.entries(expected)) {
    assert.equal(rows.filter((row) => row.place_type === placeType && row.address_source_verified === 'yes').length, count, placeType);
  }
  assert.equal(rows.filter((row) => row.address_source_verified === 'no').length, 52);
});

test('역사 장소는 공식 개별 원문으로 확인된 18건만 주소 확인 상태다', () => {
  const historic = rows.filter((row) => row.place_type === 'historic_place' && row.address_source_verified === 'yes');
  assert.equal(historic.length, 18);
  for (const row of historic) {
    assert.match(row.official_record_url, /heritage\.go\.kr\/heri\/cul\/(culSelectDetail|culGuidePostDetail)\.do/);
    assert.ok(row.official_record_id, `${row.target_id}: 국가유산 개별 식별값이 비어 있음`);
    assert.equal(row.building_direct_evidence, 'not_measured', `${row.target_id}: 주소 확인을 직접 역사근거 승인으로 승격하면 안 됨`);
  }
});

test('자치구청 표본은 공식 구청 소재지 명칭을 유지한다', () => {
  const offices = rows.filter((row) => row.place_type === 'public_building' && row.address_source_verified === 'yes');
  assert.equal(offices.length, 25);
  for (const row of offices) assert.equal(row.place_name, `${row.district}청`, row.target_id);
});
