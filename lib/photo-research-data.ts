import legacy from '../data/photo-research/bundle.json';
import additional from '../data/integrated-research/photo-items.json';
import workbookPhotos from '../data/archive-workbook/photos.json';
import summary from '../data/archive-workbook/summary.json';
import type {PhotoResearchBundle, PhotoResearchItem, PhotoResearchMeta} from './photo-research';

const items = [...legacy.items, ...additional, ...workbookPhotos] as unknown as PhotoResearchItem[];
const counts = new Map<string, number>();
const previews = new Map<string, number>();
for (const row of items) if (row.sourceUrl) counts.set(row.sourceKey, (counts.get(row.sourceKey) || 0) + 1);
for (const row of items) if (row.previewUrl) previews.set(row.previewUrl, (previews.get(row.previewUrl) || 0) + 1);
const meta = summary.meta as unknown as PhotoResearchMeta;
const aliases = meta.integratedResearch?.idAliases || {};
// Derived counts can change across collections; supplied IDs and original values cannot.
export const photoResearchBundle: PhotoResearchBundle = {meta, items: items.map(row => ({...row,
  sameSourceCount: counts.get(row.sourceKey) || 0,
  samePreviewCount: previews.get(row.previewUrl || '') || 0,
  previousIds: [...new Set([...(row.previousIds || []), ...Object.keys(aliases).filter(id => aliases[id] === row.id)])],
}))};
