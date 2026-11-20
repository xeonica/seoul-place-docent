import raw from '../../../../data/document-research/bundle.json';
import articleSummary from '../../../../data/document-research/article-summary.json';
import {documentContext, documentPlaceResearch, documentTables, filterDocumentRows, isDocumentTable, type DocumentBundle, type DocumentFilters} from '../../../../lib/document-research';
import {isSeoulDistrict, loadDistrictResearchIndex} from '../../../../lib/district-history-index';

const bundle = raw as unknown as DocumentBundle;
const articleFiles = articleSummary as unknown as {files: DocumentBundle['meta']['files']; count: number};
bundle.meta.files.push(...articleFiles.files);
bundle.meta.counts.articles = articleFiles.count;
const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const PAGE_SIZE = 20;

function pageNumber(rawPage: string | null) {
  const value = Number(rawPage || 1);
  return Math.min(5000, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));
}

async function collectArticles(request: Request, filters: DocumentFilters, requestedPage: number, download: boolean) {
  const sourceDistricts = [...new Set(articleFiles.files.map((file) => file.title.replace(/ 기사 조사자료$/, '')))];
  const districts = filters.district ? (isSeoulDistrict(filters.district) && sourceDistricts.includes(filters.district) ? [filters.district] : []) : sourceDistricts;
  let total = 0;
  let start = 0;
  const visible: DocumentBundle['tables']['articles'] = [];
  const tail: DocumentBundle['tables']['articles'] = [];
  const lower = (requestedPage - 1) * PAGE_SIZE;
  const upper = lower + PAGE_SIZE;
  for (const district of districts) {
    const index = await loadDistrictResearchIndex<DocumentBundle['tables']['articles'][number]>(request.url, 'articles', district);
    const regional = {...bundle, tables: {...bundle.tables, articles: index.rows}};
    const rows = filterDocumentRows(regional, 'articles', filters);
    if (download) visible.push(...rows);
    else {
      const from = Math.max(0, lower - start);
      const to = Math.min(rows.length, upper - start);
      if (from < to) visible.push(...rows.slice(from, to));
      tail.push(...rows);
      if (tail.length > PAGE_SIZE) tail.splice(0, tail.length - PAGE_SIZE);
    }
    start += rows.length;
    total += rows.length;
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  return {rows: !download && page !== requestedPage ? tail : visible, total, page};
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('mode') === 'place') {
    const district = params.get('district') || '';
    if (!bundle.targets.some((target) => target.level === '자치구' && target.district === district)) return Response.json({error: '서울 자치구를 선택해 주세요.'}, {status: 400, headers});
    return Response.json(documentPlaceResearch(bundle, district, params.getAll('dong').slice(0, 20)), {headers});
  }

  const table = params.get('table') || 'drafts';
  if (!isDocumentTable(table)) return Response.json({error: '조사자료 표를 확인해 주세요.'}, {status: 400, headers});
  const filters: DocumentFilters = {
    query: (params.get('q') || '').slice(0, 150), district: params.get('district') || '', target: params.get('target') || '',
    source: params.get('source') || '', evidence: params.get('evidence') || '', id: params.get('id') || '', issuesOnly: params.get('issues') === '1',
  };
  if (filters.target && !bundle.targets.some((target) => target.id === filters.target)) return Response.json({error: '조사대상 ID를 확인해 주세요.'}, {status: 400, headers});
  const requestedPage = pageNumber(params.get('page'));
  const download = params.get('download') === '1';

  let rows: DocumentBundle['tables'][typeof table];
  let total: number;
  let page = requestedPage;
  if (table === 'articles') {
    const result = await collectArticles(request, filters, requestedPage, download);
    rows = result.rows;
    total = result.total;
    page = result.page;
  } else {
    const allRows = filterDocumentRows(bundle, table, filters);
    total = allRows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(requestedPage, pages);
    rows = download ? allRows : allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const visible = rows;
  const counts = Object.fromEntries(documentTables.map((key) => [
    key,
    key === 'articles' ? (table === 'articles' ? total : bundle.meta.counts.articles) : filterDocumentRows(bundle, key, {...filters, id: ''}).length,
  ]));
  return Response.json({table, total, page, pageSize: PAGE_SIZE, rows: visible, counts, context: documentContext(bundle, visible),
    ...(download ? {provenance: bundle.meta, filters} : {})}, {headers: {...headers,
    ...(download ? {'Content-Disposition': `attachment; filename="seoul-history-doc-${table}.json"`} : {})}});
}
