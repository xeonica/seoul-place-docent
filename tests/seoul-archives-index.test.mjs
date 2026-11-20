import test from 'node:test';
import assert from 'node:assert/strict';
import entries from '../data/seoul-archives/photos.json' with {type:'json'};
import {manualPhotoItems} from '../lib/manual-photos.ts';
import {photoResearchThumbnail} from '../lib/photo-research.ts';
test('every collected 서울기록원 entry is displayable with source and terms',()=>{
  const items=manualPhotoItems(entries,'seoul-archives');assert.equal(items.length,entries.length);
  for(const i of items){assert.ok(photoResearchThumbnail(i),i.id);assert.match(i.sourceUrl,/^https:\/\/archives\.seoul\.go\.kr\/item\/\d+$/);assert.match(i.values['이용조건'],/제한없음/);assert.ok(i.id.startsWith('seoul-archives-'));}
});
test('ids from different registries do not collide',()=>{assert.equal(manualPhotoItems([{district:'중구',title:'t',imageUrl:'https://a.kr/x.jpg',sourceUrl:'https://a.kr/1',institution:'i',license:'l',allowDisplay:true}])[0].id,'manual-0');});
