import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const slug = (value) => value.replace(/[^가-힣A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function writeDistrictResearchShards(root, articles, photos) {
  if (!Array.isArray(articles) || !Array.isArray(photos)) throw new Error('기사·사진 배열이 필요합니다.');
  const districtNames = [...new Set([...articles.map((row) => row.district), ...photos.map((row) => row.district)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
  if (districtNames.length !== 25) throw new Error(`서울 자치구 인덱스 수가 25개가 아닙니다: ${districtNames.length}`);

  const sourceCounts = new Map();
  const previewCounts = new Map();
  for (const item of photos) {
    if (item.sourceUrl) sourceCounts.set(item.sourceKey, (sourceCounts.get(item.sourceKey) || 0) + 1);
    if (item.previewUrl) previewCounts.set(item.previewUrl, (previewCounts.get(item.previewUrl) || 0) + 1);
  }
  const normalizedPhotos = photos.map((item) => ({
    ...item,
    sameSourceCount: item.sourceUrl ? sourceCounts.get(item.sourceKey) || 1 : 0,
    samePreviewCount: item.previewUrl ? previewCounts.get(item.previewUrl) || 1 : 0,
  }));

  const publicRoot = path.join(root, 'public/research/seoul-district-collection/shards');
  const articleDir = path.join(publicRoot, 'articles');
  const photoDir = path.join(publicRoot, 'photos');
  await mkdir(articleDir, {recursive: true});
  await mkdir(photoDir, {recursive: true});

  const manifest = {version: 1, articleCount: articles.length, photoCount: photos.length, districts: []};
  for (const district of districtNames) {
    const districtArticles = articles.filter((row) => row.district === district);
    const districtPhotos = normalizedPhotos.filter((row) => row.district === district);
    const fileSlug = slug(district);
    const articleBytes = gzipSync(JSON.stringify({rows: districtArticles}), {level: 9});
    const photoBytes = gzipSync(JSON.stringify({items: districtPhotos}), {level: 9});
    const articlePath = path.join(articleDir, `${fileSlug}.json.gz`);
    const photoPath = path.join(photoDir, `${fileSlug}.json.gz`);
    await writeFile(articlePath, articleBytes);
    await writeFile(photoPath, photoBytes);
    manifest.districts.push({
      name: district,
      slug: fileSlug,
      articles: {count: districtArticles.length, bytes: articleBytes.length, sha256: createHash('sha256').update(articleBytes).digest('hex')},
      photos: {count: districtPhotos.length, bytes: photoBytes.length, sha256: createHash('sha256').update(photoBytes).digest('hex')},
    });
  }
  await writeFile(path.join(publicRoot, 'manifest.json'), JSON.stringify(manifest) + '\n');
  return manifest;
}
