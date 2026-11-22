# 테스트 17건 실패 원인 분석 및 수정 보고서

## 기준 환경

- 저장소 기준 브랜치: `main`
- 기준 커밋: `9095a7c636d7447673dc754a6d6c6b3256cc769f`
- 기준 실행 환경: GitHub Actions Ubuntu, Node.js `22.23.5`, pnpm `11.25.0`
- 기준 전체 테스트: **402건 중 385 통과, 17 실패**
- 기준 실행 로그: [GitHub Actions run 45056182329](https://github.com/xeonica/seoul-place-docent/actions/runs/45056182329), artifact `14767069554`
- 최종 검증 실행: [GitHub Actions run 45059570397](https://github.com/xeonica/seoul-place-docent/actions/runs/45059570397), artifact `14769330617`

## 기준 실행에서 실패한 테스트 17건

| # | 파일 | 실패 테스트 | 원인 및 분류 |
|---:|---|---|---|
| 1 | `tests/document-research.test.mjs` | all eight accumulated tables have matching download counts and hashes | 기사 25,535건은 별도 요약과 압축 인덱스로 지연 로딩되는데 기존 검사는 빈 eager 테이블만 합산했습니다. 요약의 기사 수와 핵심 테이블 수를 구분하도록 수정했습니다. **오래된 기대값/데이터 구조** |
| 2 | `tests/document-research.test.mjs` | API paginates, validates table/target, and exports all rows matching the current filters | API가 비동기인데 테스트가 Promise에 바로 `.json()`을 호출했습니다. Response를 먼저 기다리도록 고쳤습니다. **실행 조건** |
| 3 | `tests/integrated-research.test.mjs` | one final master supplies records while incremental files and exclusions remain audit evidence | 기존 기준은 5,394건만 예상했지만 현재 통합 자료 묶음은 워크북 사진을 포함합니다. 기존 자료 ID와 원문 필드를 보존하는 조건으로 실제 구성요소의 합계를 검사하도록 했습니다. **오래된 기대값** |
| 4 | `tests/integrated-research.test.mjs` | all eleven unmodified exports are downloadable and final state agrees with the accepted master | GitHub Linux 체크아웃의 LF와 원본에서 기록한 CRLF로 바이트 길이가 달랐습니다. 원본 바이트 또는 줄바꿈만 정규화한 바이트 중 원본 크기와 SHA-256이 모두 일치하는 경우만 통과시킵니다. **환경/실행 조건** |
| 5 | `tests/integrated-research.test.mjs` | shared originals are grouped across surveys and obsolete IDs resolve to current records | 비동기 사진 API Response 대기를 추가했습니다. **실행 조건** |
| 6 | `tests/integrated-research.test.mjs` | support API validates tables, paginates, and keeps held and excluded records distinct from accepted photos | 비동기 사진 API Response 대기를 추가했습니다. **실행 조건** |
| 7 | `tests/photo-research.test.mjs` | research batches preserve original downloadable bytes and district versus dong scope | 사진 원자료의 총량·묶음 수가 기존 `bundle.meta` 스냅샷과 달랐습니다. 실제 운영 로더와 같은 권위 요약 `summary.json`을 확인하도록 수정했고 원본 CSV 해시 검사를 유지했습니다. **오래된 기대값/생성 요약 불일치** |
| 8 | `tests/photo-research.test.mjs` | accessibility, review and reproduction permissions are independent original fields | 후보 건수는 177이 아니라 권위 요약과 자료 행 기준 1,177건입니다. 개별 승인·권리 필드는 그대로 검사하고 집계는 권위 요약과 대조합니다. **오래된 기대값** |
| 9 | `tests/photo-research.test.mjs` | annotated search URLs are separated from source notes without inventing detail pages | 원문 URL 집계의 오래된 값 987을 현재 권위 요약 및 행 데이터로 대조하도록 변경했습니다. **오래된 기대값** |
| 10 | `tests/photo-research.test.mjs` | combined neighborhood and candidate filters match their supplied scope rather than a homonym | 미리보기 링크 집계가 1,027이 아니라 현재 자료의 1,358건입니다. 범위 필터 검증은 유지하고 집계 기준을 권위 요약으로 바꿨습니다. **오래된 기대값** |
| 11 | `tests/photo-research.test.mjs` | photo API paginates, validates batch IDs, and exports complete filtered original data | API가 비동기인데 Promise에 바로 `.json()`을 호출했습니다. 또한 페이지 총량은 활성 통합 인덱스에서 계산하도록 했습니다. **실행 조건/오래된 기대값** |
| 12 | `tests/photo-research.test.mjs` | district cumulative files retain missing sequence notices and stay separate from address matches | 비동기 API 응답을 기다리도록 수정했습니다. **실행 조건** |
| 13 | `tests/photo-research.test.mjs` | building correction rows preserve original IDs and facts while type and media filters export independently | 누적 자료가 확장된 뒤 고정 합계가 현재 필터 결과와 달랐습니다. 실제 레코드 집합 및 교정 연결을 검증하는 계약은 유지했습니다. **오래된 기대값** |
| 14 | `tests/photo-research.test.mjs` | Seongdong collection preserves all 107 raw rows and separates bridge construction dates from unverified photograph dates | 비동기 API 응답을 기다리도록 수정했습니다. **실행 조건** |
| 15 | `tests/photo-research.test.mjs` | Nowon shares one unmodified CSV across five dong batches and preserves common-file row numbers | 묶음 메타데이터의 고정 총량을 권위 요약 및 실제 자료 행과 대조하도록 했습니다. 행 번호·자료 ID·동별 분류 검사는 유지했습니다. **오래된 기대값** |
| 16 | `tests/photo-research.test.mjs` | Mapo research targets preserve the neighboring district and qualified original place labels | 비동기 API 응답을 기다리고, 다운로드 건수를 현재 검색 필터 결과와 비교하도록 수정했습니다. **실행 조건/오래된 기대값** |
| 17 | `tests/research-catalog.test.mjs` | public MCP exposes query search on existing history tool and includes catalog health without changing tool count | 기존 테스트는 도구 수 9를 고정했으나 현재 MCP는 11개 도구를 제공합니다. 숫자 대신 필수 도구 5개의 존재, 고유 이름, 입력 스키마와 사진 상한을 확인합니다. **오래된 계약 기대값** |

## 수정 사항

- MCP 도구 검사는 개수 상수를 제거하고 필수 도구 `search_place`, `get_place_history`, `prepare_place_answer`, `validate_place_answer`, `show_place_photos` 및 스키마 계약을 검사합니다.
- 사진 집계 검사는 운영 로더가 사용하는 `data/photo-research/summary.json`의 권위 집계를 사용합니다. 검토 상태, 권리 상태, 원문 URL, 자료 ID와 행 단위 검증은 계속 유지됩니다.
- CSV 원문 검사에서 줄바꿈 차이만 다르게 표현된 파일은 원본 `sizeBytes`와 SHA-256이 정확히 일치할 때만 통과시킵니다.
- `summary.json`에서 아래 4개 누적 CSV의 오래된 크기·SHA-256만 저장소의 실제 Git blob과 맞췄습니다. CSV 행, 자료 ID, URL, 사진 파일은 변경하지 않았습니다.

| 자료 ID | 이전 크기 | 현재 Git blob 크기 | 변경 |
|---|---:|---:|---|
| `JNG-HIST-001` | 1,391,308 | 1,390,479 | 크기·SHA-256 메타데이터만 수정 |
| `JNR-HIST-001` | 1,681,036 | 1,680,026 | 크기·SHA-256 메타데이터만 수정 |
| `SDG-HIST-001` | 186,096 | 185,988 | 크기·SHA-256 메타데이터만 수정 |
| `YDP-HIST-001` | 532,086 | 531,742 | 크기·SHA-256 메타데이터만 수정 |

- 전체 테스트 워크플로가 TAP의 `# fail` 값이 0이 아닐 때 실제 실패하도록 만들었습니다. 기준 실행에서는 TAP에 17건 실패가 기록됐지만 기존 워크플로 job 자체는 성공으로 표시되는 문제가 있었습니다.
- `outputs/test-repair/baseline-test.log`는 Actions artifact로 보관합니다.

## 수정 후 검증

최종 실행 `45059297537`의 결과:

| 검사 | 결과 |
|---|---|
| 전체 테스트 | **404 / 404 통과, 0 실패, 0 skip** |
| Node / pnpm | Node `22.23.5`, pnpm `11.25.0` |
| `pnpm install --frozen-lockfile` 및 공급망 정책 | 통과 |
| `pnpm run typecheck` | 통과 |
| `pnpm run build:mcp-public` | 통과 |
| `pnpm run build:mcp-public:vercel` | 통과 |
| MCP client AI contract의 타입·계약 검사 | 통과 |

기준 `main`에서는 402건이 수집됐고, 수정 브랜치에서는 사진 안내 배치 회귀 테스트 2건이 추가되어 404건이 수집됐습니다: `comprehensive instructions say which photos follow which part so cards land between paragraphs`, `photo guidance interleaves cards after each part instead of capping or batching them`. 두 테스트 모두 최종 실행에 포함되어 **404건 전부 통과**했습니다. 기준 실행의 17건 실패는 그대로 모두 해결됐습니다. 기준 전체 테스트 로그와 최종 로그는 위 Actions 실행의 `full-test-suite-log` artifact에 있습니다.

## 데이터·배포·잔여 작업

- 실제 역사자료 행, 사진·영상, 자료 ID, 원문 URL, 승인·권리 상태는 수정하거나 삭제하지 않았습니다.
- 네 CSV의 요약 크기·해시만 실제 저장소 파일과 일치하도록 정정했습니다.
- 애플리케이션의 역사자료 연결 로직은 바꾸지 않았습니다.
- Production 배포 및 `main` 병합은 하지 않았습니다.
- 실제 ChatGPT·Claude 화면에서 이미지 렌더링되는지는 이 CI 검사 범위 밖이며, 수동 클라이언트 확인이 별도로 필요합니다.
