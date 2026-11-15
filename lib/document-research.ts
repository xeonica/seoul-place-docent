export const documentTables = ['targets', 'articles', 'sources', 'links', 'claims', 'drafts', 'timeline', 'leads', 'progress'] as const;
export type DocumentTable = typeof documentTables[number];
export type DocumentRow = {
  id: string; targetIds: string[]; sourceIds: string[]; evidenceIds: string[];
  district: string; label: string; status: string; issues: string[]; values: Record<string, string>;
};
export type DocumentTarget = {id: string; parentId: string; name: string; district: string; level: string; code: string};
export type DocumentFile = {key: string; title: string; filename: string; path: string; count: number; columns: string[]; sizeBytes: number; sha256: string};
export type DocumentMeta = {
  id: string; title: string; importedOn: string; dateRange: string[]; totalRecords: number;
  files: DocumentFile[]; counts: Record<DocumentTable, number>; sourceUrlCount: number;
  repeatedUrlGroupCount: number; invalidLinkCount: number; missingReferenceCount: number;
  warnings: {table: string; id: string; reason: string}[]; scopeNote: string;
};
export type DocumentBundle = {meta: DocumentMeta; targets: DocumentTarget[]; tables: Record<DocumentTable, DocumentRow[]>};
export type DocumentFilters = {query?: string; district?: string; target?: string; source?: string; evidence?: string; id?: string; issuesOnly?: boolean};
export const documentLabels: Record<DocumentTable, string> = {
  targets: '조사대상', articles: '기사 조사자료', sources: '문헌', links: '지역 연결', claims: '주장·근거',
  drafts: '본문 초안', timeline: '연표', leads: '시각자료 단서', progress: '진행 현황',
};
export function isDocumentTable(value: string): value is DocumentTable {
  return documentTables.includes(value as DocumentTable);
}
export function safeDocumentUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
export function filterDocumentRows(bundle: DocumentBundle, table: DocumentTable, filters: DocumentFilters = {}) {
  const terms = (filters.query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return bundle.tables[table].filter(row => {
    if (filters.district && row.district !== filters.district && !row.targetIds.some(id => bundle.targets.some(t => t.id === id && t.district === filters.district))) return false;
    if (filters.target && !row.targetIds.includes(filters.target)) return false;
    if (filters.source && !row.sourceIds.includes(filters.source)) return false;
    if (filters.evidence && !row.evidenceIds.includes(filters.evidence)) return false;
    if (filters.id && row.id !== filters.id) return false;
    if (filters.issuesOnly && !row.issues.length && !/상충 확인/.test(row.values['자료간상충여부'] || '') && row.status !== '상충 확인') return false;
    const text = [row.id, ...Object.values(row.values)].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
export function documentContext(bundle: DocumentBundle, rows: DocumentRow[]) {
  const sourceIds = new Set(rows.flatMap(r => r.sourceIds));
  const evidenceIds = new Set(rows.flatMap(r => r.evidenceIds));
  const claims = bundle.tables.claims.filter(r => evidenceIds.has(r.id));
  claims.forEach(r => r.sourceIds.forEach(id => sourceIds.add(id)));
  return {
    sources: bundle.tables.sources.filter(r => sourceIds.has(r.id)).map(r => ({id: r.id, title: r.values['자료명'], url: safeDocumentUrl(r.values['원문URL']), status: r.status})),
    claims: claims.map(r => ({id: r.id, text: r.values['역사적주장'], sourceIds: r.sourceIds, status: r.status, locator: r.values['원문위치']})),
  };
}
export function documentPlaceResearch(bundle: DocumentBundle, district: string, dongs: string[]) {
  const exact = bundle.targets.filter(t => t.level === '법정동' && t.district === district && dongs.includes(t.name));
  const localIds = new Set(exact.map(t => t.id));
  const districtTarget = bundle.targets.find(t => t.level === '자치구' && t.district === district);
  const localDrafts = bundle.tables.drafts.filter(r => r.targetIds.some(id => localIds.has(id)));
  const districtDraft = districtTarget ? bundle.tables.drafts.find(r => r.targetIds.includes(districtTarget.id)) : undefined;
  const drafts = localDrafts.length ? localDrafts : districtDraft ? [districtDraft] : [];
  const scopeIds = localDrafts.length ? localIds : new Set(districtTarget ? [districtTarget.id] : []);
  const timeline = bundle.tables.timeline.filter(r => r.targetIds.some(id => scopeIds.has(id)));
  const localLinks = bundle.tables.links.filter(r => r.targetIds.some(id => localIds.has(id)));
  return {
    district, exactTargets: exact, scope: localDrafts.length ? 'legal_dong' : 'district',
    target: localDrafts.length === 1 ? localDrafts[0].targetIds[0] : localDrafts.length > 1 ? '' : districtTarget?.id || '',
    drafts, timeline: timeline.slice(0, 4), timelineTotal: timeline.length,
    localSourceCount: new Set(localLinks.flatMap(r => r.sourceIds)).size,
    context: documentContext(bundle, drafts),
  };
}
export type DocumentPlaceResearch = ReturnType<typeof documentPlaceResearch>;

