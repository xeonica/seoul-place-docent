import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(process.argv[2] || '.tmp-district-research');
const archivePath = '/research/seoul-district-collection/자료조사.zip';
const archiveFile = path.join(root, 'public/research/seoul-district-collection/자료조사.zip');
const archiveBytes = await readFile(archiveFile);
const archiveSha = createHash('sha256').update(archiveBytes).digest('hex');
const articleFiles = [];
const photoFiles = [];
const articles = [];
const photos = [];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {field += '"'; i++;}
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {row.push(field); field = '';}
    else if (ch === '\n') {row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '';}
    else field += ch;
  }
  if (field || row.length) {row.push(field.replace(/\r$/, '')); rows.push(row);}
  return rows;
}
const keyOf = value => value.normalize('NFKC').toLowerCase().replace(/[\s_·ㆍ()（）./-]/g, '');
function pick(row, keys) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([name, value]) => keyOf(name) === keyOf(key) && value.trim());
    if (found) return found[1].trim();
  }
  for (const key of keys) {
    const needle = keyOf(key);
    const found = entries.find(([name, value]) => keyOf(name).includes(needle) && value.trim());
    if (found) return found[1].trim();
  }
  return '';
}
function objectRows(csv, file) {
  const [header = [], ...records] = parseCsv(csv.replace(/^\uFEFF/, ''));
  return records.filter(cells => cells.some(value => value.trim())).map((cells, index) => {
    const values = {};
    header.forEach((key, i) => {if (key) values[key] = cells[i] || '';});
    if (cells.length > header.length) values['추가 열'] = cells.slice(header.length).join(' | ');
    return {values, index: index + 1, header, file};
  });
}
function safeUrl(raw) {
  const found = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;]+$/, '');
  try {const url = new URL(found); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;} catch {return null;}
}
function slug(value) {return value.replace(/[^가-힣A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();}
function compactValues(raw, standard, terms) {
  const search = Object.entries(raw).filter(([key, value]) => terms.some(term => keyOf(key).includes(keyOf(term))) && value.trim())
    .map(([key, value]) => `${key}: ${value.trim().slice(0, 100)}`).join(' · ').slice(0, 400);
  return {...Object.fromEntries(Object.entries(standard).filter(([,value]) => value !== '')), ...(search ? {'추가 검색어': search} : {})};
}

for (const kind of ['articles', 'photos']) {
  const dir = path.join(input, kind);
  const files = (await readdir(dir)).filter(name => name.endsWith('.csv')).sort((a,b) => a.localeCompare(b, 'ko'));
  for (const filename of files) {
    const filePath = path.join(dir, filename);
    const source = await readFile(filePath);
    const csv = source.toString('utf8');
    const parsed = objectRows(csv, filename);
    const district = filename.replace(/-(?:articles|photos)\.csv$/, '');
    const outName = `${slug(district)}-${kind}.csv`;
    const file = kind === 'articles'
      ? {key: 'articles', title: `${district} 기사 조사자료`, filename: '자료조사.zip', path: archivePath, count: parsed.length, columns: parsed[0]?.header || [], sizeBytes: archiveBytes.length, sha256: archiveSha}
      : {id: `DISTRICT-${slug(district)}`, district, dong: '', filename: '자료조사.zip', count: parsed.length, columns: parsed[0]?.header || [], path: archivePath, sha256: archiveSha, sizeBytes: archiveBytes.length, sourceUrlCount: new Set(parsed.map(row => safeUrl(pick(row.values, ['original_url','원문URL','원문 URL','자료URL','상세URL']))).filter(Boolean)).size, candidateCount: parsed.length, previewLinkCount: 0, collectionScope: 'district', sourceNote: `원본 CSV ${filename}은 ZIP 안에 보존됩니다. 자치구 단위 조사이며 개별 장소·건물 일치는 확인되지 않았습니다.`, headerLine: 1, visualRecordCount: parsed.length, buildingRecordCount: 0, correctionCount: 0};
    (kind === 'articles' ? articleFiles : photoFiles).push(file);
    for (const record of parsed) {
      const raw = record.values;
      if (kind === 'articles') {
        const sourceId = pick(raw, ['article_id', '기사_ID', '기사ID', '기사 ID', '자료ID']) || String(record.index).padStart(5, '0');
        const title = pick(raw, ['original_title', '기사_원제목', '기사 원제목', '신문기사제목', '기사제목', '제목']) || '제목 미확인';
        const publisher = pick(raw, ['publisher', '신문사', '언론사', '발행처']);
        const date = pick(raw, ['published_date', '신문 발행일', '신문_발행일', '발행일', 'publication_date']);
        const url = safeUrl(pick(raw, ['original_url', '원문URL', '원문_URL', '기사URL', 'URL']));
        const summary = pick(raw, ['summary', '기사요약', '핵심요약', '기사_요약', '내용요약', '요약']);
        const rowId = `DISTRICT-ARTICLE-${slug(district)}-${slug(sourceId)}-${String(record.index).padStart(5, '0')}`;
        const values = compactValues(raw, {'기사 ID': sourceId, '자료명': title.slice(0, 300), '자치구': district, '신문사': publisher, '신문 발행일': date, '원문URL': url || '', '기사요약': summary.slice(0, 500), '사건명': pick(raw, ['event_name', '사건명', '관련사건']).slice(0, 200), '사건일자': pick(raw, ['event_date', '사건일자']).slice(0, 100), '신문 지면': pick(raw, ['page', '지면/면수', '면수']).slice(0, 100), '조사 CSV': filename, 'CSV 행': String(record.index), '검토상태': '첨부자료 표기 · 원문 독립 검증 안 됨'}, ['title','summary','headline','event','topic','keyword','subject','region','district','location','place','date','name','article','사건','주제','장소','지역','요약','제목','키워드','시설','인물']);
        articles.push({id: rowId, targetIds: [], sourceIds: [], evidenceIds: [], district, label: title, status: '첨부자료 표기 · 원문 독립 검증 안 됨', issues: [], values});
      } else {
        const sourceId = pick(raw, ['photo_id', '자료ID', '자료 ID', '기록번호']) || `${slug(district)}-${String(record.index).padStart(5, '0')}`;
        const title = pick(raw, ['photo_title', '자료명', '자료제목', '자료 제목', '원문제목', '사진제목', '제목']) || '제목 미확인';
        const url = safeUrl(pick(raw, ['original_url', '원문URL', '원문 URL', '자료URL', '상세URL']));
        const date = pick(raw, ['photo_date', '촬영시기', '촬영일', '촬영연도', '시대', 'period']);
        const provider = pick(raw, ['provider', '자료원', '소장기관', '소장처', '제공기관·출처', '출처']);
        const declaredPreview = pick(raw, ['preview_url', '미리보기URL', '사진URL', '이미지URL', '썸네일URL']);
        const rights = pick(raw, ['사이트표시가능여부', '사이트 표시 가능 여부', '저작권·이용조건', '이용조건']);
        const preview = /^(가능|허용|공개 가능|공개)$/i.test(rights) ? safeUrl(declaredPreview) : null;
        const rowId = `DISTRICT-PHOTO-${slug(district)}-${slug(sourceId)}`;
        const values = compactValues(raw, {'자료ID': sourceId, '자료명': title.slice(0, 300), '자치구': district, '원문URL': url || '', '촬영시기': date.slice(0, 150), '제공기관·채널': provider.slice(0, 200), '원문 설명': pick(raw, ['description','caption','내용설명','자료설명','설명']).slice(0, 500), '원문 장소 표기': pick(raw, ['location_name','장소명','관련장소','조사지역','동네·법정동','법정동권역']).slice(0, 200), '자료 분류': pick(raw, ['photo_type','자료분류','자료구분','사진유형']).slice(0, 100), '이용조건': rights.slice(0, 500) || '이용조건 미확인', '검토상태': '첨부자료 표기 · 원문 독립 검증 안 됨', '공간범위': '자치구 조사자료 · 장소·건물 일치 미확인', '조사 CSV': filename, 'CSV 행': String(record.index)}, ['title','description','caption','location','place','period','date','provider','archive','collection','topic','subject','keyword','district','region','address','building','landmark','장소','지명','촬영','시기','분류','자료명','원제목','설명','주소','구역','동네','기관','소장']);
        const sourceKey = url ? createHash('sha256').update(url).digest('hex').slice(0, 16) : `missing-${rowId}`;
        photos.push({id: rowId, batchId: `DISTRICT-${slug(district)}`, district, dong: '', dataRow: record.index, collectionScope: 'district', recordType: 'visual', mediaType: pick(raw, ['media_type', '매체유형', '자료분류', '자료유형', '사진유형', '시각자료유형']) || '사진·지도 조사자료', correctionOf: null, correctionIds: [], sourceUrl: url, sourceKey, sourceLinkType: url ? 'record' : 'missing', previewUrl: preview, provider: provider || '제공기관 미확인', reviewStatus: '첨부자료 표기 · 원문 독립 검증 안 됨', relation: '미확인', scope: '자치구 조사자료 · 장소·건물 일치 미확인', candidate: true, conflictMentioned: false, sameSourceCount: 1, samePreviewCount: preview ? 1 : 0, values});
      }
    }
  }
}

if (articleFiles.length !== 25 || photoFiles.length !== 25) throw new Error(`구별 CSV 파일 수가 예상과 다릅니다: 기사 ${articleFiles.length}, 사진 ${photoFiles.length}`);
const articleSummary = {files: articleFiles, count: articles.length};
await writeFile(path.join(root, 'data/document-research/article-summary.json'), JSON.stringify(articleSummary) + '\n');
const articleGzip = path.join(root, 'public/research/seoul-district-collection/articles-index.json.gz');
await writeFile(articleGzip, gzipSync(JSON.stringify({rows: articles}), {level: 9}));
const photoTarget = path.join(root, 'public/research/seoul-district-collection/photos-index.json.gz');
const photoSummary = {files: photoFiles, count: photos.length,
  sourceUrlCount: new Set(photos.map(row => row.sourceUrl).filter(Boolean)).size,
  missingSourceUrlCount: photos.filter(row => !row.sourceUrl).length,
  previewLinkCount: photos.filter(row => row.previewUrl).length,
  candidateCount: photos.filter(row => row.candidate).length,
  mediaTypes: [...new Set(photos.map(row => row.mediaType))].sort(),
  providers: [...new Set(photos.map(row => row.provider))].sort()};
await writeFile(path.join(root, 'data/photo-research/district-summary.json'), JSON.stringify(photoSummary) + '\n');
await writeFile(photoTarget, gzipSync(JSON.stringify({items: photos}), {level: 9}));
console.log(JSON.stringify({districts: 25, articleFiles: articleFiles.length, articleRows: articles.length, articleIndexGzipBytes: (await readFile(articleGzip)).length, photoFiles: photoFiles.length, photoRows: photos.length, photoIndexGzipBytes: (await readFile(photoTarget)).length, districtNames: articleFiles.map(file => file.title.replace(' 기사 조사자료', ''))}, null, 2));

