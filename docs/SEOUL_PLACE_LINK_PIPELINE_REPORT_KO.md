# 서울 장소 연결 파이프라인 구현·검증 보고서

- 기준일: 2026-11-22 (Asia/Seoul)
- 저장소 기준: `origin/main` / `db568907748119875693feaf7b9db09574c9555c`
- 작업 브랜치: `codex/seoul-place-link-pipeline`
- 운영 데이터 변경, main 병합, Production 배포: 없음

## 요약

기존 자료를 보존하는 추가형 장소·필지 식별 및 자료 연결 구조를 구현했다. 자료의 장소 관계, 원문 확인, 권리 상태, 근거와 검토 이력을 따로 저장하고, 자동 연결은 항상 검토 대기 상태로 시작한다. 동 이름·제목·키워드 일치만으로 `exact_site`가 되지 않는다.

기존 감사 인덱스에서 확인한 원문 URL 누락 3,285건은 원문 주소가 비어 있는 행으로 확인됐다. 확인할 원문이 없어 링크를 임의 복구하지 않았다. 새 스키마와 MCP 연결 코드는 브랜치에 추가했지만, D1 운영 접속 정보가 현재 세션에 없어 실제 운영 DB 적용은 하지 않았다.

## 1. 기존 진단 재현 및 데이터 범위

이전 진단 자료 `outputs/seoul-place-link-issues.csv`와 `docs/SEOUL_HISTORY_DATA_AUDIT_KO.md`의 집계와 누락 행 분포를 다시 대조했다.

| 감사 대상 색인 | 행 수 | 원문 URL 누락 | 원문 URL 문법 오류 | 미리보기 URL |
|---|---:|---:|---:|---:|
| 구별 기사 색인 | 25,535 | 90 | 0 | 해당 없음 |
| 구별 사진 색인 | 25,210 | 3,195 | 0 | 0 |

현재 `origin/main`에 포함된 사진 번들은 이 감사 인덱스와 다른 자료 집합이다. 현재 번들은 5,319행, 원문 URL 누락 15행, 미리보기 1,358행이다. 따라서 위 25,210행 사진 색인 전체에 미리보기 URL이 없다는 결과를 현재 사이트의 모든 사진 자료에 일반화하지 않았다. 현재 main에는 25,535행 기사·25,210행 사진 전수 색인 파일이 포함되어 있지 않다.

저장소의 `research-data/*.csv` 카탈로그는 2,895 관측행, 2,064개 고유 원문 URL, 중복 관측 829행이다. `places.csv`의 장소 3건은 주소/장소 식별 미검증이며, `record_place_links.csv`의 링크 7건도 승인되지 않은 후보로만 처리했다.

## 2. 원문 URL·미리보기 누락 원인

누락 행은 모두 인덱스의 원문 URL 필드가 빈 행이며, URL 문법 오류는 아니다.

- 기사 90행: 동작구 55행, 마포구 35행. 모두 `source_url_missing`, `primary_source_not_independently_rechecked`로 기록되어 있다.
- 사진 3,195행: 성북구 1,000, 중구 989, 용산구 987, 양천구 100, 마포구 95, 용산구 지도 11·항공사진 2, 중구 지도 11행이다. 모두 `source_url_missing`, `preview_missing`, `display_rights_not_verified`가 표시되어 있다.
- 사진 색인의 미리보기 0건은 해당 전수 색인 안에서 확인된 값이다. 출처 원문 또는 별도 허가된 미리보기 주소가 기록되어 있지 않아, 다른 데이터의 URL을 대입하거나 새 URL을 추정하지 않았다.

확인된 원문 링크 복구: 기사 0건, 사진 0건. 나머지는 미확인으로 보류한다.

## 3. D1 오류 경로와 수정

호출 경로는 MCP Streamable HTTP `POST /mcp` → JSON-RPC `tools/call` → `handleMcpMessage` → `auditedCall` → `execute('get_archive_stats', args)`였다. 실제 인자는 `{}`이며 도구의 `z.object({}).strict().parse(args)` 검증을 통과한다. 기존 코드에서는 그 직후 `database(env)`가 `env.DB` 바인딩 부재로 `ARCHIVE_NOT_READY`를 던졌고, 통계 SQL은 실행되지 않았다. MCP 오류가 클라이언트에서 `INVALID_ARGUMENT`로 잘못 표시됐다. 즉, SQL 인자 오류가 아니라 운영 D1 미설정이 원인이었다. 감사 레코드에는 request ID·도구·성공 여부·오류 유형·처리 시간만 저장하며 입력값과 원문 예외는 기록하지 않는다.

변경 코드에서는 D1 미설정을 정상적인 구조화 결과 `available:false, errorCode:ARCHIVE_NOT_CONFIGURED`로 반환한다. D1은 연결됐으나 SQL이 실패하면 `ARCHIVE_QUERY_FAILED`로 구분한다. MCP 감사 통계도 `available:false` 응답을 성공 호출로 계산하지 않도록 했다. D1이 연결된 성공 응답의 기존 통계 필드는 그대로 두고 `available:true`를 추가했다.

운영 호출에서 D1 설정이 없는 상태는 그대로다. 실제 자격 증명과 Cloudflare 연결은 제공되지 않아 D1 운영 연결이나 마이그레이션은 검증·적용하지 않았다.

## 4. BigQuery·R2 개별 확인

마장로42길 16의 주소를 검색한 뒤 MCP 장소 이력을 확인했다.

- `bigQueryResearch`: `unavailable`, 반환 후보 0건
- `bigQueryGitHubResearch`: `ready`, 후보 1건
- 해당 후보의 원문·장소 관계 승인 여부: 미확인. 저장소 코드에서도 BigQuery/GitHub 결과는 확정 근거가 아닌 후보로 표시된다.
- `prepare_place_answer`: 정상 반환, 장소 직접 자료 0건, 동네 기록 8건. 동네 기록을 건물 직접 역사로 바꾸지 않았다.
- R2: 이 세션 환경에 Cloudflare/R2 접속 설정이 없어 객체 목록·읽기 시험을 수행하지 못했다. 저장 여부를 추정하지 않았다.

## 5. 추가형 자료·장소 연결 파이프라인

추가한 D1 엔터티 및 링크 구조:

- `archive_places`: 장소 유형, 도로명·지번, 자치구·법정동, 건물관리번호, PNU, 좌표·좌표 출처, 장소 식별 근거 URL, 등록자.
- `archive_place_reviews`: 공식 장소 식별 확인을 revision 이벤트로 저장한다. 새 장소는 항상 검토 대기이며, 공식 원문 URL·근거·검토자를 추가해 검토한다. 가장 최근 식별 검토가 철회·보류되면 기존 링크 승인도 직접 근거로 사용할 수 없다.
- `archive_source_places`: 자료·장소 ID, 관계, 매칭 방법·거리, 근거 ID/내용, 원문 URL·기관, 원문 확인 상태, 권리 상태, 검토 상태, 행위자·생성 시각.
- `archive_source_place_reviews`: 검토 결과를 수정 대신 revision 이벤트로 추가하는 append-only 이력.

관계 분류는 `exact_site`, `parcel`, `nearby`, `district_context`, `uncertain`으로 저장한다. 건물관리번호·명시적으로 대조된 장소 ID는 장소 식별이 검증된 경우에만 직접 건물 후보가 된다. PNU는 건물과 혼동하지 않고 부지 관계로 분리한다. 좌표 기반 관계는 검증된 좌표 출처가 모두 있을 때만 거리를 계산하며 기본 1km 이내를 `nearby` 후보로 둔다. 구 단위만 일치하면 `district_context`; 식별 근거가 부족하면 `uncertain`이다.

후보 생성은 기존 자료를 갱신하거나 삭제하지 않는 INSERT 전용 함수로 구현했다. 승인 이벤트도 별도 revision으로 추가한다. 직접 장소/부지 근거로 활용하려면 공식 장소 식별, 원문 확인, 별도 사람 검토를 모두 통과해야 한다. 기존 카탈로그의 장소 링크 7건은 모두 검토 대기이며, 이번 코드로 승인된 링크는 0건이다.

주소의 공식 건물관리번호 또는 지번에서 계산한 PNU와 일치하는 D1 링크만 MCP `get_place_history` 및 `prepare_place_answer`에 선택적으로 추가 반환한다. PNU 조회는 parcel 유형만 가져오고, 같은 필지 안 다른 건물 자료를 섞지 않는다. 응답에는 자료 제목·유형·발행일, 원문 URL·기관, 권리·검토 상태, 근거 ID, 관계와 거리, 검토 이력을 포함한다. 좌표는 출처가 확인된 좌표끼리 후보 거리 계산에 쓰며 주소 검색 API가 제공하지 않는 좌표를 추정하지 않는다. 새 테이블 미적용 시 기존 역사자료 검색은 유지하고 `schema_pending` 상태를 별도로 돌려준다. 반환 링크는 장소 식별·링크 검토·원문 확인이 통과되기 전 직접 근거로 사용할 수 없게 표시한다.

## 6. 25개 구 주소 표본

자치구별로 구청, 도서관, 초등학교, 시장, 주민센터 검색을 각각 실행했다. 실제 MCP `search_place` 결과에서 기대 자치구가 일치하는 주소를 골라 기록했다.

- 125건 / 25개 구 / 구별 5건
- 기대 자치구와 MCP 반환 구 일치: 125/125
- 반환 건물명이 검색 유형과 일치: 120/125. 5건은 건물명이 비었거나 ‘용산구종합행정타운’처럼 유형명을 그대로 포함하지 않아 추가 확인 대상으로 표시했다.
- 이 표본은 주소 검색이 해당 구 주소 후보를 반환하는지 검증한다. 기사·사진이 그 건물/부지에 관한 역사 근거라는 검증은 아니다.
- 주소·건물명·유형 확인 상태는 [seoul-address-validation.csv](./seoul-address-validation.csv)에 기록했다. 주소 자료와 검색 결과를 보존했으며 주소 token은 포함하지 않았다.

## 7. 테스트 및 빌드

| 검증 | 결과 |
|---|---|
| 관리자 인증·장소 관계 분류·DB 추가/검토 이력 표적 테스트 | 13/13 통과 |
| TypeScript 타입 검사 | 핵심 구현 시점 통과; 마지막 PNU 조회 변경 후에는 재실행 불가 |
| 공개 MCP 패키지 빌드 | 통과 |
| Vercel 공개 MCP Build Output 패키지 | 통과 |
| Next.js Production 빌드 | 핵심 구현 시점 통과; 마지막 PNU 조회 변경 후에는 재실행 불가 |
| 전체 자동 테스트 | 338개 중 319 통과, 19 실패 |

전체 테스트 실패 19건은 변경 전 `origin/main` 기준 worktree에서 동일 테스트를 실행해도 같은 19건이 실패했다. 기준 브랜치(329개 중 310 통과·19 실패)와 현재(338개 중 319 통과·19 실패)를 동일 환경에서 비교했으며, 실패 테스트 이름 차이는 0건이다. 새로 발생한 실패는 없다. 기존 실패 중에는 사진·조사자료 번들 기대값과 현재 자료의 불일치, MCP Accept 헤더 테스트 기대와 현재 코드 동작 차이가 포함된다. 이번에 추가한 9개 테스트는 모두 통과했다. 관리자 인증, 장소 관계 분류, D1 추가·검토 이력, PNU 조회 및 카탈로그 표적 테스트는 13/13 통과했다. 별도 MCP HTTP 표적 묶음에는 기준 브랜치에서도 실패한 Accept 헤더 기대값 1건이 있다.

## 8. 수정 파일

- `db/schema.ts`, `drizzle/0006_tired_jack_flag.sql`, `drizzle/0007_tearful_the_renegades.sql`, `drizzle/0008_careful_place_review.sql`, `drizzle/meta/*`
- `lib/place-linking.ts`, `lib/archive-place-link.ts`, `lib/archive-db.ts`, `lib/research-catalog.ts`, `lib/mcp-audit.ts`
- `app/mcp/route.ts`
- `app/api/archive/place-links/route.ts` (기존 관리자 인증을 쓰는 `register_place`, `review_place_identity`, `record_candidate`, `review_link` POST API)
- `tests/place-linking.test.mjs`, `tests/archive-place-link.test.mjs`, `tests/archive-place-link-route.test.mjs`, `tests/research-catalog.test.mjs`, `tests/mcp-http-audit.test.mjs`
- `docs/seoul-address-validation.csv`

기존 역사자료, 원문 URL, 권리 정보, BigQuery/D1/R2 운영 데이터는 변경하지 않았다.

## 9. 미해결 및 후속 작업

1. 운영 D1 환경 변수/바인딩을 확인하고 세 개의 추가 migration을 별도 검토·적용해야 새 장소 링크가 실서비스에서 조회된다. 이번에는 적용하지 않았다.
2. R2 읽기 전용 자격 증명/객체 목록 권한이 없어 실제 접근 상태는 미확인이다.
3. 직접 BigQuery 연결은 이번 MCP 호출에서 `unavailable`이었다. GitHub BigQuery 후보 1건도 승인 근거가 아니다.
4. 기사 URL 90건, 사진 URL 3,195건과 사진 미리보기 0건의 원문/권리 확인 및 링크 복구는 자료 제공기관 원문을 확인할 수 있을 때 별도 진행해야 한다.
5. 전체 주소 표본 125건은 주소 인식 점검이다. 장소 관계 승인 및 역사자료 원문 검증을 완료한 수는 0건이다.
6. 오프라인 의존성 설치는 pnpm 공급망 정책 검사에서 중단됐다. 마지막 PNU 조회 변경 이후 TypeScript 검사와 Next.js 빌드를 다시 실행하지 못했다. 앞선 변경 시점의 빌드 성공 기록을 이번 최종 변경의 빌드 통과로 간주하지 않는다.

## 10. PR #77 안정화 및 실증 보완 (2026-11-22)

### GitHub Actions HTTP 계약 실패

PR SHA `20bb068e20aae632a88fe94d8b5f614d9de84c95`에서 `MCP client AI contract`와 `Public MCP deployment contract`가 모두 `tests/mcp-http-audit.test.mjs:33`의 `406 expected / 200 actual`에서 실패했다. 두 워크플로의 원인은 동일한 Accept 헤더 테스트였다. 공개 MCP는 JSON 응답만 제공하며, 기존 main의 `lib/mcp-http.ts`도 `application/json`을 허용하고 JSON을 거부하는 Accept 값에만 406을 반환한다. 따라서 JSON만 허용한 클라이언트에 406을 기대하던 테스트가 서버 계약과 맞지 않았다.

테스트를 JSON-only `initialize` 요청의 200 응답 및 JSON content-type 검증으로 고쳤다. `application/json;q=0, text/event-stream` 및 SSE-only는 계속 406을 기대한다. Origin, Content-Type, 크기 제한 및 현대 MCP 메타데이터 검증은 그대로 둬 안전 검증을 우회하지 않았다. 설명 주석과 MCP 문서도 JSON 호환 동작에 맞췄다.

### 검사 재실행

| 검사 | 결과 |
|---|---|
| GitHub `types` 체크, 기준 SHA 20bb068 | 통과 기록 확인 |
| 로컬 `pnpm run typecheck` | 통과 (설치된 Node v24.22.3; 저장소 엔진 선언은 Node 22) |
| Next.js Production 빌드 | 통과, 별도 `.next-pr77-build` 경로 사용. 기본 `.next`를 사용하는 개발 서버와 충돌을 피함 |
| MCP 공개 패키지 빌드 | 통과 |
| Vercel MCP Build Output 패키지 | 통과 |
| MCP HTTP 표적 테스트 | 8/8 통과 |
| 관계·마이그레이션·권한 표적 테스트 | 10/10 통과 |
| 전체 자동 테스트 | 339개 중 321 통과, 18 실패 |

PR SHA의 이전 전체 테스트 결과(338개 중 319 통과·19 실패)에서 HTTP Accept 실패 1건이 해소됐다. 실패했던 나머지 18개 테스트는 앞선 기준 main 대조에서도 확인된 자료 번들·사진 조사 fixture 불일치다. 이번 수정으로 추가된 데이터 처리 실패는 확인되지 않았다. 공급망 검사는 비활성화하지 않았다. 참고로 pnpm 스크립트가 기본 PATH의 Node 26에선 테스트 전용 `--experimental-transform-types` 옵션을 인식하지 않아 테스트는 Node 24.22.3 실행 파일로 직접 구동했다.

### Migration 및 권한 검증 범위

`drizzle/0006`~`0008`을 독립 메모리 SQLite fixture에 적용했다. migration 전 존재하던 archive source 행이 적용 후에도 보존됨을 확인했다. 같은 승인 ID의 재등록은 거절되고 검토 이력은 한 건으로 유지됐다. PNU가 같은 건물 유형 장소 후보에는 `exact_site` 근거로 인정되지 않으며, 필지 유형에서만 `parcel` 후보가 되는 회귀 테스트를 추가했다. 관리자 API는 인증 누락과 교차 출처 요청을 각각 403으로 차단했다. 표적 테스트는 10/10 통과했다.

이 검증은 로컬 메모리 SQLite만 대상으로 했다. 로컬 환경에는 Cloudflare account/API token/D1 ID가 설정되지 않았고 로컬 `.env`도 없었다. Vercel Preview의 변수를 읽는 연결도 제공되지 않아 Preview D1의 실제 ID·바인딩 상태를 검증하거나 migration을 적용하지 않았다. Production D1에는 접속하거나 변경하지 않았다.

### 주소별 읽기 전용 MCP 실증

연결된 테스트 도슨트 MCP에 `search_place → get_place_history → prepare_place_answer → validate_place_answer`를 주소별로 실행했다. `search_place`의 출처 표시는 주소기반산업지원서비스이며 두 건 모두 후보 1개와 공식 건물관리번호가 반환됐다.

| 주소 | 반환 건물관리번호 | PNU 상태 | 장소 직접 자료 / 반환 근거 ID | 검증 |
|---|---|---|---|---|
| 성동구 마장로42길 16 세림아파트 (지번 마장동 784) | `1120010500100210000021801` | 지번에서 산출한 후보 `1120010500007840000`; 별도 공식 지적 API 확인은 미완료 | 직접 자료 0건, `unverified`; 동네 근거 `claim:E000421` (준비 응답에는 `claim:E000420`도 포함) | `claim:E000421` 동네 배경 문단 `valid: true`; 건물·필지 역사 held |
| 성동구 독서당로 218 옥수삼성아파트 (지번 옥수동 250) | `1120011300102500000010289` | 지번에서 산출한 후보 `1120011300002500000`; 별도 공식 지적 API 확인은 미완료 | 직접 자료 0건, `unverified`; 동네 근거 `claim:E000430`, `claim:E000431`, `claim:E000432` | `claim:E000430`을 사용한 제출 문단이 제외되어 `valid: false`, `omitted: 1` |

두 주소 모두 테스트 MCP의 `dataSources.bigQuery`는 `disabled`, 사진·영상 URL 수는 0이었다. 근거는 각각 동네 범위(`dong`)로만 다뤘으며 건물의 직접 역사로 사용하지 않았다. MCP 응답의 서버 영수증은 `auditPersisted:false`이므로 서버 감사 로그에 저장된 호출이라고 주장하지 않는다. 사용한 근거 ID는 테스트 MCP 응답에서 반환된 ID다.

공식 건물관리번호는 주소 검색 응답의 값을 기록했다. PNU는 응답의 법정동 코드와 지번으로 계산한 검증 후보이며 공식 지적 API의 결과가 아니므로 확정값으로 표시하지 않는다. 직접 원문 대조 및 개별 기사·사진 검토를 하지 않았고 테스트 D1 등록도 하지 않았다. 따라서 `exact_site`/`parcel`로 승인된 근거는 두 주소 모두 0건이다.

### Preview / Production 구분 및 남은 작업

기준 SHA `20bb068`의 GitHub Vercel 상태는 성공이며 프로젝트 경로는 `seoul-place-docent-mcp`로 표시됐다. 이것은 해당 SHA의 Vercel 배포 체크 성공만 뜻하고 Preview D1 바인딩 또는 Production 배포 여부를 검증한 증거가 아니다. 이 작업에서 Preview 재배포를 요청하거나 Production을 배포하지 않았다.

남은 확인: PR 브랜치의 새 커밋에 대한 GitHub Actions 재실행, Vercel Preview에 필요한 비밀 없는 환경변수 존재 여부와 Preview 전용 D1 DB ID/바인딩 확인, 독립 Preview DB에만 migration 적용, 공식 PNU 조회, 직접 자료 원문과 권리 확인, 두 번째 주소의 근거 문단 검증 실패 분석. BigQuery의 비활성 상태와 R2 접근 여부는 Preview D1 상태와 별개이며 이번 세션에서는 확인하지 못했다.
