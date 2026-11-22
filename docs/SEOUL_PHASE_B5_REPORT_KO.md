# PR #78 Phase B.5 실증 및 Phase C 준비 보고서

확인일: 2026-11-22
대상: PR #78 `codex/seoul-docent-integration`
확인한 PR 기준 커밋: `ad173a2a5ffc9d3b3dd6148716299f355461bc37`
기준 main: `db568907748119875693feaf7b9db09574c9555c`

## 요약

- PR은 열린 Draft 상태이며, 확인 당시 GitHub Actions의 `contract`, `types`, `public-mcp`와 Vercel Preview 상태는 모두 성공이었다. GitHub `types` 작업은 Node 22.23.5 / pnpm 11.25.0을 사용했다.
- 같은 잠금 파일과 의존성 설치를 사용해 Node 22.23.5로 로컬 전체 테스트를 실행했다. 기준 main은 329개 중 310 통과·19 실패, PR은 360개 중 342 통과·18 실패였다. PR의 실패 18개는 모두 기준 main에서도 실패했고, 기준 main에서 실패한 MCP HTTP 헤더 테스트 1개는 PR에서 통과했다. 이 비교에서 신규 실패는 0개다.
- 테스트 실패는 조사 데이터 내보내기·해시 기대값과 사진 자료 검증 fixture 등 기존 데이터/fixture 검증 계열이다. `consolidated-research.test.mjs`의 영상 조사 그룹 테스트도 두 브랜치에서 동일하게 실패한다. 이번 작업에서는 기대값을 임의로 바꾸지 않았다.
- Preview MCP는 initialize, tools/list, `get_archive_stats`, `search_place` 호출에 HTTP 200으로 응답했다. 서버는 v2.0.0이며 PR 코드와 같은 도구 계약을 제공한다. 다만 `get_archive_stats`는 정상 MCP 도구 결과 안에 `ARCHIVE_NOT_CONFIGURED`를 반환했고, 주소 조회는 `JUSO_API_KEY` 미설정 안내를 반환했다. 따라서 실제 역사자료·주소 검증은 실행되지 않았다.
- 연결된 별도 MCP 클라이언트에서는 `get_archive_stats({})`에 `INVALID_ARGUMENT`가 관측됐지만, PR Preview 직접 호출은 같은 빈 객체 인자로 이를 재현하지 않았다. 연결 플러그인의 직접 endpoint와 tools/list 원시 스키마에 접근할 수 없어 버전·전송 계약 불일치를 확정할 수 없다. PR 코드의 재현된 원인이라고 단정하지 않았다.
- `outputs/seoul-125-address-validation.csv`에는 구별 5유형 × 25개 구의 125개 검증 슬롯을 만들었다. 기존 MCP 주소 후보 75개(시장·학교·구청)는 가져왔으나 행 단위 공식 원문 확인은 미완료라 `address_source_verified=no`다. 아파트 25개와 역사장소 25개는 대상 레코드와 주소를 아직 추출하지 않아 미선정으로 기록했다. 공식 원문으로 검증 완료된 주소는 현재 0/125다.

## PR 및 Preview 확인

PR #78은 열려 있는 Draft이며 병합되지 않았다. 실행 중인 Preview URL은 다음과 같다.

`https://seoul-place-docent-mcp-git-codex-seoul-d-07007f-smn0365465-1518.vercel.app`

직접 요청 결과:

| 요청 | HTTP / 결과 | 판단 |
|---|---|---|
| MCP `initialize` | 200, protocol `2025-11-25`, server `seoul-place-docent` v2.0.0 | 응답 정상 |
| MCP `tools/list` | 200, 도구 스키마 반환 | 저장소 계약과 일치 |
| `get_archive_stats({})` | 200, `available:false`, `ARCHIVE_NOT_CONFIGURED` | D1 연결 설정 없음 |
| `search_place({query:'서울특별시 성동구 마장로42길 16',page:1})` | 200, 주소 검색 준비 안내 | 주소 API 키 미설정 |

이 MCP 서비스는 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN` 세 항목이 있어야 D1 HTTP 연결을 구성한다. R2는 `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`가 있어야 한다. API 응답은 Preview가 현재 값을 제공하지 않았음을 뜻한다. 비밀 값은 읽거나 보고하지 않았다.

### Preview를 실제 자료 검증 가능하게 설정하는 절차

1. Vercel의 `smn0365465-1518` 팀에서 프로젝트 `seoul-place-docent-mcp`의 **Settings → Environment Variables → Preview**를 연다.
2. Preview 전용 Cloudflare D1을 먼저 만들고 위 D1 변수 3개를 Preview 환경에만 설정한다. Production용 D1 ID와 Preview용 D1 ID가 다르다는 것을 Cloudflare D1 화면에서 대조한다.
3. Cloudflare API 토큰은 해당 계정 및 Preview D1에 필요한 최소 권한만 부여한다. 토큰 값은 터미널·PR·채팅에 복사하지 않는다.
4. 주소 조회가 필요하면 Preview 환경에 `JUSO_API_KEY`를 설정한다. 선택 기능에 따라 `BUILDING_API_KEY`, `KAKAO_REST_API_KEY`도 설정한다.
5. Preview 재배포 후 MCP initialize/tools/list, `get_archive_stats`, 서울 주소 `search_place`를 다시 호출하고 D1 연결 여부와 검색 결과를 기록한다.
6. Production과 Preview DB ID가 다름을 확인하기 전에는 migration을 실행하지 않는다. 이 작업에서는 원격 DB 확인이나 migration을 수행하지 않았다.

R2 접근성도 실제 Preview에서 설정이 비어 있어 미검증이다. 현재 응답만으로 운영 R2의 상태를 추정하지 않는다.

## 서울 25개 구 주소 표본

`outputs/seoul-125-address-validation.csv`는 125행이고 각 자치구에 `apartment`, `market`, `school`, `historic_place`, `public_building` 각 1행을 둔다.

| 항목 | 건수 | 검증 상태 |
|---|---:|---|
| 전체 표본 슬롯 | 125 | 유형·자치구별 작업 목록 구성 완료 |
| 기존 MCP 주소 검색 후보 이관 | 75 | 도로명/지번 주소 후보는 있음, 공식 행 단위 원문 확인 미완료 |
| 아파트 공식 레코드·주소 | 0 | 미선정. 서울시 공동주택 데이터셋은 후보 발굴 출처로만 연결 |
| 역사 장소 공식 레코드·주소 | 0 | 미선정. 서울시 지정문화재 데이터셋은 후보 발굴 출처로만 연결 |
| 공식 주소 원문까지 검증 완료 | 0 | 확인된 주소만 완료 처리하는 기준 적용 |
| PR Preview MCP 개별 표본 조회 완료 | 0/125 | 주소 API 미설정으로 전체 미측정 |
| 건물관리번호·PNU·직접근거·원문 확인 | 미측정 | Preview D1 및 주소 API 설정 필요 |

이전 표본 125개는 구청·도서관·초등학교·시장·주민센터 조합이었다. 그중 기존 검색 후보에서 학교 25, 시장 25, 구청 25를 새 유형 슬롯에 참고 후보로 이관했다. 이 자료는 공식 레코드 대조를 하지 않았으므로 공식 주소 확보 건수로 세지 않는다. 아파트와 역사장소 주소를 임의 생성하지 않았다.

후보 발굴에 쓸 수 있는 공식 데이터 카탈로그:

- [서울시 공동주택 아파트 정보](https://data.seoul.go.kr/dataList/OA-15818/S/1/datasetView.do): 아파트명·주소 등 제공. 자료 행은 이 작업에서 내려받아 확인하지 않았다.
- [서울시 전통시장 현황](https://data.seoul.go.kr/dataList/OA-23058/S/1/datasetView.do): 자치구·시장명·주소 제공. CSV 레코드와 기존 후보의 일치 검증은 미완료다.
- [서울시 소재 문화재 지정 현황](https://data.seoul.go.kr/dataList/OA-15593/F/1/datasetView.do): 지정·등록문화재 현황 파일 제공. 개별 행의 주소 추출은 미완료다.
- 학교 후보에는 교육청 공식 학교현황 원문을, 공공건물은 해당 기관의 공식 주소 원문을 추가 연결해야 한다.

## 역사자료 연결·장소 식별 결과

이번 Preview는 D1 미설정 상태이므로 표본 125개에서 직접 자료 없음(0건)으로 결론내리지 않았다. `building_direct_evidence`, `parcel_direct_evidence`, `dong_context_evidence`, 원문·근거 ID·검토상태는 모두 `not_measured` 상태로 남겼다. `search_place`는 연결 준비 안내를 반환했고, place_id·건물관리번호·PNU 발급 결과는 없다. 복수 주소 후보의 첫 결과를 자동 선택하는 실증도 실행되지 않았다.

기존 `outputs/seoul-phase-b-district-status.csv`와 `outputs/seoul-25-district-coverage.csv`의 기존 Phase B 지표는 유지한다. 기존 자료에서 직접 장소·부지 근거와 원문 상태 역시 25개 구 전반에 걸쳐 미측정으로 기록되어 있다.

## `get_archive_stats` INVALID_ARGUMENT

PR #78의 `app/mcp/route.ts`와 `lib/mcp-protocol.ts`에서 `get_archive_stats`는 빈 객체 인자(`{}`)를 받고, `tools/list`에도 필수 인자 없는 객체 스키마로 공개된다. 동일 스키마로 Preview에 직접 요청하면 HTTP 200의 정상 MCP 결과가 왔고, D1 미설정 상태를 `ARCHIVE_NOT_CONFIGURED`로 반환했다. INVALID_ARGUMENT는 Preview에서 재현되지 않았다.

따라서 현 시점에서 확인 가능한 것은 **실제 연결 플러그인과 직접 Preview 호출의 응답 계약/배포 경로가 다를 가능성**이다. 별도 연결 서버의 도구 목록과 원시 URL 응답이 없어 그 원인을 특정 버전 또는 특정 인자로 결론내릴 근거는 없다. 플러그인 재연결이나 서버 코드 변경으로 추정 해결을 시도하지 않았다.

## Phase C 코드 변경

- `lib/docent-tour-schema.ts`: `currentChange` 상태(`official_current`, `historical_only`, `no_current_update`, `not_checked`), 기준일, 출처 ID를 구조화했다. `official_current`는 출처 URL, 검토된 source claim, 기준일, 자료 ID가 모두 있어야 유효하다.
- `lib/docent-tour-builder.ts`: 공식 검토 자료에 `currentStatus`와 `asOfDate`/`effectiveDate`가 함께 있을 때만 최신 상태로 분류한다. 과거 도시공간 자료만 있으면 `historical_only`, 명시적으로 조회하여 최신 자료 없음이 기록된 경우에만 `no_current_update`, 나머지는 `not_checked`다. 7부 결론 근거는 1~5부 근거의 합집합으로 제한했다.
- `tests/docent-tour-v2.test.mjs`: 최신 사업 상태와 기준일, 출처 누락 시 검증 실패, 7부의 새로운 근거 도입 차단을 테스트한다. 기존 사진 8장·영상 3장 제한 테스트도 유지한다.

자료가 충분하지 않은 부의 `partial`/`missing` 상태와 4부 직접근거 누락 표시는 기존 구현을 유지한다. 외부 최신 사업 원문을 Preview에서 조회하지 못했으므로 실제 계획 최신성은 미실증이다. 동네 배경을 건물 직접 근거로 승격하지 않았다.

## Node 22 전체 테스트 비교

환경: Node `v22.23.5`, 동일 pnpm lockfile / 설치된 의존성.

| 대상 | 테스트 수 | 통과 | 실패 |
|---|---:|---:|---:|
| 기준 main `db568907` | 329 | 310 | 19 |
| PR 기존 Phase B 커밋 `ad173a2` | 360 | 342 | 18 |
| Phase B.5 최종 작업 트리 | 363 | 345 | 18 |

실패 테스트명과 TAP 오류 블록 전체를 비교했다. Phase B.5 최종 실패 18개는 기준 main의 같은 테스트명과 **오류 블록까지 모두 동일(18/18)**이다. 기준 main에서만 실패한 테스트는 `transport rejects origins, media types, oversized streams and invalid modern headers` 1개이며, PR에서 통과했다. Phase B.5에서 추가한 테스트 3개는 모두 통과했다. 기존 18개는 데이터 export 건수·해시 기대값 불일치와 테스트 fetch mock의 `.json is not a function` 오류 등이다. 이는 이번 Phase C 수정으로 새로 생긴 실패가 아니다.

최종 검증 결과:

- `tests/docent-tour-v2.test.mjs`: 21/21 통과
- `tests/mcp-http-audit.test.mjs`와 7부 집중 테스트: 29/29 통과
- `pnpm run typecheck`: 통과
- `pnpm run build:mcp-public`: 통과
- `pnpm run build:vercel` (Next.js production build): 통과
- 전체 Node 22 suite: 363개 중 345 통과·18 실패(모두 기준 main 공통)

로그:

- `.phase-b5-main-node22.log` (기준 main 작업 트리, 로컬 전용)
- `.phase-b5-pr-node22.log` (초기 PR 커밋, 로컬 전용)
- `.phase-b5-final-node22.log` (Phase B.5 최종 작업 트리, 로컬 전용)

## 판단 및 남은 일

- PR의 CI는 확인 당시 통과했지만 Preview 데이터 바인딩과 주소 API가 미설정이라 실자료·장소 관계는 검증되지 않았다.
- 공식 주소 표본 125건 확보는 **미완료**다. CSV는 125개 조사 슬롯을 만들고 근거 상태를 분리한 준비 산출물이다.
- `get_archive_stats`의 connected-plugin `INVALID_ARGUMENT`는 미재현이며 원인 확정 불가다.
- Preview 전용 D1 ID 분리를 확인하기 전에는 migration을 실행하지 않는다.
- Production 병합 가능 여부: **BLOCKED**. PR을 Draft로 유지한다. 기준 테스트 실패, Preview D1/JUSO 설정, 공식 주소 레코드 검증이 끝나야 다음 판단을 할 수 있다.
- main 병합, Production 배포, 운영 D1/BigQuery/R2 변경은 수행하지 않았다.
