import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'outputs', 'seoul-125-address-validation.csv');
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
  assert.equal(verified.length, 62);
  const previousVerifiedIds = [
    '종로구-market', '종로구-public_building', '중구-school', '중구-public_building', '용산구-apartment',
    '용산구-school', '용산구-public_building', '성동구-apartment', '성동구-public_building', '광진구-market',
    '광진구-school', '광진구-public_building', '동대문구-apartment', '동대문구-public_building', '중랑구-apartment',
    '중랑구-public_building', '성북구-apartment', '성북구-public_building', '강북구-school', '강북구-public_building',
    '도봉구-apartment', '도봉구-public_building', '노원구-apartment', '노원구-public_building', '은평구-apartment',
    '은평구-market', '은평구-public_building', '서대문구-apartment', '서대문구-school', '서대문구-public_building',
    '마포구-apartment', '마포구-public_building', '양천구-public_building', '강서구-school', '강서구-public_building',
    '구로구-public_building', '금천구-public_building', '영등포구-apartment', '영등포구-public_building',
    '동작구-apartment', '동작구-public_building', '관악구-school', '관악구-public_building', '서초구-public_building',
    '강남구-apartment', '강남구-public_building', '송파구-apartment', '송파구-public_building', '강동구-apartment',
    '강동구-school', '강동구-public_building',
  ];
  for (const id of previousVerifiedIds) {
    assert.equal(rows.find((row) => row.target_id === id)?.address_source_verified, 'yes', `${id}: 기존 확인 주소를 보존해야 함`);
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

test('역사 장소는 공식 개별 원문으로 확인된 9건만 주소 확인 상태다', () => {
  const historic = rows.filter((row) => row.place_type === 'historic_place' && row.address_source_verified === 'yes');
  assert.equal(historic.length, 9);
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
