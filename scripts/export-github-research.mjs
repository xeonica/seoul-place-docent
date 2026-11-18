import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCatalog, parseCsv } from './research-catalog.mjs';

const output = process.argv[2];
if (!output) throw new Error('Pass the output NDJSON path');

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const sourceCommit = git('rev-parse', 'HEAD').toString().trim();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const paths = git('ls-tree', '-r', '--name-only', '-z', sourceCommit, '--', 'research-data/')
  .toString().split('\0').filter((path) => path.endsWith('.csv'));

const files = paths.map((path) => {
  const bytes = git('show', `${sourceCommit}:${path}`);
  return { path, sha256: hash(bytes), ...parseCsv(bytes.toString('utf8')) };
});
const observations = new Map();
for (const item of buildCatalog(files).items) {
  for (const observation of item.observations) {
    observations.set(`${observation.file}:${observation.line}`, { item, observation });
  }
}

const pick = (values, ...keys) => keys.map((key) => values[key]?.trim()).find(Boolean) ?? null;
const rows = files.flatMap(({ path, sha256, rows }) => {
  let kind = 'research_observation';
  if (path.endsWith('/places.csv')) kind = 'place';
  if (path.endsWith('/record_place_links.csv')) kind = 'place_link';
  return rows.map(({ line, values }) => {
    const hit = observations.get(`${path}:${line}`);
    return {
      import_row_id: hash(`${path}:${sha256}:${line}`),
      source_commit: sourceCommit,
      source_file: path,
      source_file_sha256: sha256,
      source_line: line,
      row_kind: kind,
      research_id: hit?.item.id ?? null,
      original_record_id: pick(values, '자료ID', 'record_id', 'candidate_id'),
      place_id: pick(values, 'place_id'),
      source_url: hit?.item.sourceUrl ?? null,
      title: pick(values, '자료명', '후보명', 'record_title', 'title'),
      media_type: pick(values, '매체유형', '자료유형', 'record_type', 'material_type'),
      review_status: pick(values, '검토상태', '검토등급', '접근성_검증수준', 'review_status', 'verification_status', 'link_review_status'),
      rights_status: pick(values, '이용조건', '권리상태', 'rights_status'),
      usable_as_verified_evidence: false,
      original_values: values,
    };
  });
});
if (!rows.length || new Set(rows.map((row) => row.import_row_id)).size !== rows.length) {
  throw new Error('Expected nonempty research data with unique import IDs');
}
writeFileSync(output, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(`Exported ${rows.length} rows from ${paths.length} tracked CSVs at ${sourceCommit}`);
