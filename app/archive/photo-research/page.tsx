import type {Metadata} from 'next';
import summary from '@/data/archive-workbook/summary.json';
import districtSummary from '@/data/photo-research/district-summary.json';
import PhotoResearch from './photo-research';
import type {PhotoResearchMeta} from '@/lib/photo-research';
import './photo-research.css';
import './integrated-research.css';
export const metadata: Metadata = {
  title: '사진·지도·영상·건물 조사자료 | 서울 장소 도슨트',
  description: `${summary.meta.districtCount}개 자치구·${summary.meta.dongCount}개 동의 자료와 서울 전역 통합조사, 총 ${summary.meta.recordCount}행. 시각자료와 건물 역사 카드의 시기·장소 관계·이용조건과 제공기관 원문을 탐색합니다.`,
};
export default function PhotoResearchPage() {
  const additions = districtSummary as unknown as {files: PhotoResearchMeta['files']; count: number; sourceUrlCount: number; missingSourceUrlCount: number; previewLinkCount: number; candidateCount: number; providers: string[]; mediaTypes: string[]};
  const meta = summary.meta as unknown as PhotoResearchMeta;
  return <PhotoResearch meta={{...meta, files: [...meta.files, ...additions.files], batchCount: meta.batchCount + additions.files.length,
    districtCount: new Set([...meta.files, ...additions.files].map(file => file.district)).size, districtBatchCount: meta.districtBatchCount + additions.files.length,
    recordCount: meta.recordCount + additions.count, visualRecordCount: meta.visualRecordCount + additions.count,
    sourceUrlCount: meta.sourceUrlCount + additions.sourceUrlCount, missingSourceUrlCount: meta.missingSourceUrlCount + additions.missingSourceUrlCount,
    previewLinkCount: meta.previewLinkCount + additions.previewLinkCount, candidateCount: meta.candidateCount + additions.candidateCount,
    mediaTypes: [...new Set([...meta.mediaTypes, ...additions.mediaTypes])].sort(),
    districts: [...new Set([...(meta.districts || []), ...additions.files.map(file => file.district)])].sort(),
    scopeCounts: {...meta.scopeCounts, '자치구 조사자료 · 장소·건물 일치 미확인': additions.count},
    relationCounts: {...meta.relationCounts, '미확인': (meta.relationCounts['미확인'] || 0) + additions.count},
    providers: [...new Set([...meta.providers, ...additions.providers])].sort()}}/>;
}

