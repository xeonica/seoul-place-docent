import type {Metadata} from 'next';
import summary from '@/data/document-research/summary.json';
import articles from '@/data/document-research/article-summary.json';
import DocumentResearch from './document-research';
import './document-research.css';
export const metadata: Metadata = {
  title: '서울 역사 문헌 조사자료 | 서울 장소 도슨트',
  description: '서울 전체·25개 자치구·467개 법정동의 조사대상, 문헌 279건, 주장 근거 1,070건, 본문 초안 53개와 연표 857건을 출처와 함께 탐색합니다.',
};
export default function DocumentResearchPage() {
  const articleData = articles as unknown as {files: typeof summary.meta.files; count: number};
  return <DocumentResearch meta={{...summary.meta, counts: {...summary.meta.counts, articles: articleData.count}, files: [...summary.meta.files, ...articleData.files]}} targets={summary.targets}/>;
}

