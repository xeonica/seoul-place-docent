# 서울 도슨트 PR #78 Phase D.1 실증 결과

기준 커밋: `99035bf049061ee71c11c47a6695dd8795354aa3`

작업 브랜치: `codex/seoul-docent-integration`

확인일: 2026-11-22 (Asia/Seoul)

Preview 런타임 재확인 시 PR 코드 HEAD는 `4317db7ebc218a5518bacf21c73ba8ae9e27f54a`였다. 이 커밋은 MCP 기록 사진 갤러리 메타데이터 자동 연결을 비활성화한 3줄 변경이다. 이 보고서는 지정된 기준 커밋 상태와 최신 코드 HEAD 상태를 구분한다.

## 판정 요약

**실제 Preview MCP 7부 실증: BLOCKED.** 확인한 Preview 배포의 `GET /health`가 HTTP 503과 `status=not_configured`를 반환했다. 응답에서 `addressConfigured=false`, `auditConfigured=false`, `auditStorage=none`을 확인했다. 따라서 주소 검색과 D1 기반 감사 저장을 쓸 수 있는 상태가 아니다. Production D1과 Preview D1의 ID 비교도 Vercel 팀 설정을 읽을 권한이 없어 완료하지 못했다. 원격 도구 응답을 성공으로 간주하거나 DB 마이그레이션을 시도하지 않았다.

Preview URL은 [Vercel 배포 상세](https://vercel.com/smn0365465-1518/seoul-place-docent-mcp/ANAtH1gKWXa8xPmh5yBYX9vWtWki)에서 확인한 브랜치 배포 주소를 사용했다. Preview 별칭은 새 배포에 따라 바뀔 수 있으므로 재검증 때 Vercel의 최신 Preview URL을 다시 복사해야 한다.

환경변수 확인 범위: `JUSO_API_KEY`는 health의 `addressConfigured=false`로 런타임 미설정이 확인됐다. `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN`은 Vercel 팀 변수 목록에 접근하지 못해 개별 존재 여부를 확인할 수 없다. 런타임 health에서는 D1 감사 어댑터가 없다고 확인됐으나, 어떤 개별 변수가 누락됐는지는 미측정이다. Preview/Production D1 ID 비교도 미완료다.

## Preview 및 MCP 요청 결과

| 요청 | 결과 | 의미 |
|---|---|---|
| `GET /health` | HTTP 503, `not_configured` | Preview 설정 미완료 |
| MCP `initialize` (JSON-RPC ID `1`) | 요청 1회 시도, 응답 원문 보존 실패 | 프로토콜 성공 여부 미측정 |
| MCP `tools/list` (ID `2`) | 요청 1회 시도, 응답 원문 보존 실패 | 도구 목록 미측정 |
| `get_archive_stats({})` (ID `3`) | 요청 1회 시도, 응답 원문 보존 실패 | 통계 및 D1 조회 미측정 |
| `search_place({query: "서울특별시 성동구 마장로42길 16"})` (ID `4`) | 요청 1회 시도, 응답 원문 보존 실패 | 주소 검색 및 토큰 미측정 |

요청 원문과 응답 본문이 실행 로그에 보존되지 않아 HTTP 상태, 요청 추적 ID, 근거 ID 및 반환 건수를 추정하지 않았다. 설정 문제를 해결하기 위한 반복 요청도 하지 않았다. 유효한 `search_place` 결과/토큰이 확인되지 않아 나머지 세 장소의 순차 호출과 각 장소의 후속 도구 호출은 실행 완료로 기록하지 않는다.

## 네 장소별 실증 상태

| 장소 | 주소 출처 상태 | Preview 도구 흐름 | 역사자료 상태 |
|---|---|---|---|
| 세림아파트 | 사용자 지정 주소. 125건 공식 주소 CSV에서 해당 주소의 개별 원문 레코드는 확인되지 않음 | `search_place` ID `4` 1회 시도, 응답 보존 실패. 후속 단계 미측정 | 건물·필지 직접 근거 미측정 |
| 서울 구 서대문형무소 | 국가유산청 개별 레코드 `1331103240000`, 공식 주소 확인 | Preview 호출 미완료 | 연결 MCP의 과거 후보 조회에는 후보 5건. 승인된 직접 근거로 간주하지 않음 |
| 망원정 터 | 국가유산청 개별 레코드 `2331100090000`, 공식 주소 확인 | Preview 호출 미완료 | 연결 MCP의 과거 후보 조회에는 후보 1건, `research:f23ace3ab7a436f4ac539e2a`; [서울연구데이터](https://data.si.re.kr/node/46863). 검토 대기 상태로 승인 근거 아님 |
| 마장축산물시장 | 서울시 대규모점포 인허가 레코드 `2006303010307500001`, 공식 주소 확인 | Preview 호출 미완료 | 연결 MCP의 과거 후보 조회에는 후보 사진 1건. [대한민국역사박물관 자료](https://archive.much.go.kr/data/01/folderView.do?jobdirSeq=568)는 2015년 시장 사진 컬렉션 후보로 확인됐으나 대상/촬영 위치 및 표시 권리 미검증 |

서대문형무소 후보군에는 국가기록원 및 서울역사자료 원문으로 연결되는 레코드가 포함되어 있었지만, 현재 보존된 결과에는 각 후보의 완전한 evidence ID 목록이 없다. 원문 URL 존재만으로 건물·필지 관계나 사진 표시 권리를 승인하지 않았다. 망원정 후보는 scope가 부지로 기록된 후보이나 원본 이미지/표시 권한 검증은 미완료다. 시장 사진 후보는 역사적 과거 사진이 아닌 2015년 현황사진 후보로 분리했다.

이 표의 후보 조회는 앞서 연결된 연구 MCP에서 얻은 후보 상태를 요약한 것이며, PR Preview의 라이브 호출 결과가 아니다. 후보들은 `research_candidates_only` 및 `usableAsVerifiedEvidence=false` 상태로 취급한다.

## 7부 및 매체 정책 — 로컬 테스트 결과

| 검증 범위 | 결과 |
|---|---|
| 1~7부 순서와 각 부분의 데이터 배정 | `tests/docent-tour-v2.test.mjs` 통과 |
| 건물/필지 직접 근거와 동네 배경 분리, 직접 근거 부재 시 missing/partial | 통과 |
| 앞선 검증 근거 ID만 사용하고 7부에서 새 사실을 만들지 않음 | 통과 |
| 사진 최대 8장, 영상 최대 3개, 중복 제거 | 통과 |
| 미승인·링크 전용·권리 미확인 자료의 이미지 배정 차단 | 통과 |
| MCP JSON-RPC 계약 단위 테스트 | `tests/mcp-protocol.test.mjs` 통과 |
| 125개 주소 슬롯, 확인 73 / 미확인 52 보존 | `tests/seoul-125-address-validation.test.mjs` 통과 |

이 결과는 저장소의 결정적 로컬 fixture/계약 테스트다. Preview의 실제 `structuredContent.tourPlan` 또는 네 장소 실제 응답을 검증한 결과와 구분한다.

## 실행 환경 및 CI

- 제공된 실행 환경은 Node `v26.13.1`이었다. 저장소는 Node `22.x`를 지정하고 `--experimental-transform-types`를 사용한다. 이 Node 26 실행 파일은 해당 플래그를 인식하지 않아 원래 테스트 명령을 시작하지 못했다.
- Node 26의 대체 `--experimental-strip-types` 실행에서는 37/43 assertion이 통과했고 6개 테스트 실패가 발생했다. 이들은 `strip-only`에서 지원하지 않는 TypeScript parameter property 로딩 오류와 localhost 테스트의 `EACCES` 제한이다. 이는 Node 22 CI 결과와 비교 가능한 코드 회귀 결과가 아니다.
- 동일 기준 SHA `99035bf`에서 GitHub 상태 확인 시 Vercel Preview 체크와 Vercel Deployments 체크는 모두 `success`였다. 이는 배포 생성/체크 통과 상태이며 `/health` 503 및 런타임 환경변수 누락을 해소하지 않는다.
- 현재 추가한 진단 문서/CSV 변경 이후에는 새 체크를 아직 실행하지 않았다. 기준 SHA의 체크 통과를 이번 변경 커밋의 CI 통과로 간주하지 않는다.
- 이번 반영은 진단 문서와 결과 CSV만 추가한다. 코드/테스트 동작은 변경하지 않는다.

## 주소 조사 현황

`outputs/seoul-125-address-validation.csv`의 기존 값은 유지했다. 공식 주소 원문 확인은 73/125건, 미확인은 52/125건이다. 주소 확인과 역사자료 연결 검증은 별도다. 이번에 Preview에서 장소의 역사자료를 실증한 건수는 0건이고, 라이브 MCP 검증은 미측정이다.

## 다음 단계

Vercel 프로젝트 소유자가 Preview에 JUSO 키와 D1 연결 환경변수를 설정하고 Preview D1이 Production과 다른 데이터베이스임을 확인한 뒤, 새 Preview 배포의 `/health`부터 확인해야 한다. 상세 절차는 [VERCEL_PREVIEW_D1_SETUP_KO.md](./VERCEL_PREVIEW_D1_SETUP_KO.md)를 참조한다. 원격 D1 migration은 이 보고서 작업 중 수행하지 않았다.

**Production 병합 가능 여부: BLOCKED.** Preview의 실제 MCP 흐름, D1 격리, 네 장소의 실제 7부 응답 및 권리 상태가 확인되지 않았다. PR은 Draft로 유지한다.
