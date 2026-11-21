# 서울 도슨트 배포 준비 판정

작성일: 2026-11-22
통합 브랜치: `codex/seoul-docent-integration`

## 판정: BLOCKED

Phase A의 로컬 코드 통합은 검증했지만 Preview 원격 환경·D1 분리·25구 실주소 표본·Production 안전성을 확인하지 못했습니다. 이 결과만으로 병합이나 운영 배포 준비 완료로 볼 수 없습니다.

## 검증 결과

- `pnpm run typecheck`: PASS (Node 24 경고 표시, 저장소 엔진 요구는 Node 22)
- `pnpm run build:mcp-public`: PASS
- Next.js Webpack Production build: PASS, 임시 `.next-integration` 출력 경로 사용
- PR77/7부/장소 링크/MCP HTTP 중점 테스트: 32/32 PASS
- 신규 7부 및 D1 링크 통합 테스트: 15/15 PASS
- 기존 주소 검증 CSV: 25개 구 × 5개 주소, 총 125개 행에서 주소 후보 일치 125건으로 기록. 유형은 구청·도서관·초등학교·시장·주민센터이며 역사자료 관계 검증은 아닙니다.
- 전체 테스트: 354개 중 336 PASS, 18 FAIL. 앞서 기록된 PR #77 기준 실행도 18 FAIL이었습니다. 이번 18개는 조사자료·사진 fixture/외부 HTTP 관련입니다. 실패 테스트별 기준 로그가 없어 이름 단위로 기존/신규를 확정하지 않습니다.
- MCP Preview/Production HTTP: 미실행
- 원격 D1 migration: 미실행
- BigQuery 및 R2 실연결: 미확인
- 125개 별도 실주소 재호출, 대상 유형별 표본, 역사자료 관계 검증: 미실행. 기존 주소 인식 표본을 요약하고 미측정 역사자료 값을 `outputs/seoul-25-district-coverage.csv`에 명시했습니다.

## 마이그레이션 및 데이터 안전

PR #77의 migration 0006–0008은 코드·테스트 대상으로만 유지했습니다. 이 작업에서 Preview 또는 Production DB에 적용하지 않았고 운영 BigQuery/D1/R2 데이터도 변경하지 않았습니다. Preview DB가 Production과 분리됐다는 확인을 먼저 받아야 합니다.

## 다음 단계

1. PR #76·#77 코드를 보존하는 새 통합 PR을 검토 대상으로 제출합니다.
2. GitHub Actions에서 저장소가 요구하는 Node 22로 전체 테스트를 실행하고 현재 main 기준 결과와 비교합니다.
3. Preview 전용 환경변수와 D1 식별자를 확인한 뒤 격리된 테스트 DB에만 migration을 적용합니다.
4. 25개 구 × 5개 장소 유형의 공식 주소를 확보해 주소 검색과 역사 근거 확인을 별도 집계합니다.
5. Preview HTTP의 MCP initialize/tools/list와 두 지정 아파트 흐름을 재검증합니다.
6. 검토 승인 후에만 Production 병합·배포 계획을 별도 수립합니다.

PR 링크: 브랜치 push 및 PR 생성 전 — 아직 없음.
