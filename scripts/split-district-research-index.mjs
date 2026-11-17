import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {writeDistrictResearchShards} from './district-research-index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readIndex = async (filename) => JSON.parse(gunzipSync(await readFile(path.join(root, filename))).toString('utf8'));
const articles = await readIndex('public/research/seoul-district-collection/articles-index.json.gz');
const photos = await readIndex('public/research/seoul-district-collection/photos-index.json.gz');
const manifest = await writeDistrictResearchShards(root, articles.rows, photos.items);
console.log(JSON.stringify({
  districts: manifest.districts.length,
  articles: manifest.articleCount,
  photos: manifest.photoCount,
  articleShardBytes: manifest.districts.reduce((sum, district) => sum + district.articles.bytes, 0),
  photoShardBytes: manifest.districts.reduce((sum, district) => sum + district.photos.bytes, 0),
}, null, 2));
