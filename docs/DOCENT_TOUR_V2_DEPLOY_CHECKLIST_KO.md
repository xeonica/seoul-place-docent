# 서울 도슨트 7부 시스템 배포 체크리스트

이 문서는 PR #76을 검토·병합하고 별도 MCP 운영 프로젝트에 반영할 담당자를 위한 안내입니다. 체크리스트 작성 자체는 운영 설정이나 데이터를 변경하지 않습니다.

## PR #76 개요

- `prepare_place_answer`와 호환 경로에 선택 필드 `tourPlan`을 추가합니다. 기존 MCP 도구, 필수 입력, 기존 반환 필드는 유지합니다.
- 종합 도슨트에는 도입부와 1~7부를 안내하고, 특정 질문에는 7부 전체를 강제하지 않습니다. `brief`, `standard`, `full`은 종합 요청에서 같은 7부 순서를 유지합니다.
- 사진은 장소 범위와 부별 주제로 배정하며 투어 전체 최대 8건입니다. 영상은 전체 최대 3건입니다. 권리·표시 검증과 원문 출처 정책을 유지합니다.
- 서버 운영자 AI 호출은 없습니다. 해설 문장은 기존처럼 MCP를 호출한 사용자 AI가 작성합니다.
- PR #76 코드에는 데이터베이스 마이그레이션이 포함되지 않습니다. 이 변경을 위해 API 키, 환경변수, BigQuery, D1 또는 R2의 수정은 필요하지 않습니다.

## 병합 전 확인

- [ ] PR #76의 최신 head가 작업 결과와 일치하는지 확인합니다. PR URL: https://github.com/xeonica/seoul-place-docent/pull/76
- [ ] base `main`이 최신인지 확인하고, `main` 변경을 PR에 덮어쓰거나 강제 push하지 않습니다.
- [ ] PR #76에서 기존 MCP 반환 계약과 사진·영상 권리 검토를 확인합니다.
- [ ] GitHub Actions에서 최신 PR head의 필수 검사가 모두 성공했는지 확인합니다.
- [ ] Vercel Preview가 있다면 해당 Preview만 확인합니다. Preview 성공은 Production 배포 성공을 뜻하지 않습니다.
- [ ] 전체 테스트의 기존 조사자료 오류 16개와 기준 `main` 결과를 검토하고, PR 신규 실패가 없는지 확인합니다. 이 16개를 통과로 간주하거나 자료를 삭제해 해결하지 않습니다.
- [ ] TypeScript, 공개 MCP 빌드 2종, Next.js Production 빌드 결과를 최신 head에서 확인합니다.
- [ ] PR #76은 승인과 배포 담당자 확인 전까지 Draft로 유지합니다.

## 권장 병합·배포 순서

1. PR #76의 최종 diff, CI, Preview, 전체 테스트 비교 및 이 체크리스트를 검토합니다.
2. 기존 테스트 실패 16개의 이름과 오류 메시지가 기준 `main`과 같은지 확인하고 별도 후속 이슈로 관리합니다.
3. 담당자 승인 후에만 PR #76을 Draft에서 Ready for review로 전환합니다.
4. 리뷰 승인과 브랜치 보호 규칙을 확인한 후 **기존 PR #76**을 `main`에 병합합니다. 새 PR을 만들거나 강제 push하지 않습니다.
5. Vercel 프로젝트 `seoul-place-docent-mcp`에서 Production 배포 커밋이 실제 병합 SHA와 같은지 확인합니다. 사이트의 다른 Vercel/Sites 프로젝트에 배포하지 않습니다.
6. 배포 URL의 `/health` 응답과 `/mcp` 초기화 및 `tools/list` 응답을 확인합니다. 오류 시 MCP 응답 본문이나 브라우저 화면에 토큰·키가 노출되지 않게 합니다.
7. 다음 실증 항목을 완료한 후 배포 결과와 실제 요청 ID를 기록합니다.

## 운영 MCP 실증 — 마장로42길 16

주소: 서울특별시 성동구 마장로42길 16 (세림아파트)

1. ChatGPT에서 현재 연결된 서울 도슨트 MCP 서버 URL과 연결 상태를 확인합니다.
2. 운영 MCP의 `search_place`로 주소를 검색하고, 실제로 식별된 후보의 token만 사용합니다.
3. `prepare_place_answer`를 호출해 기존 필드와 `tourPlan`이 함께 반환되는지 확인합니다.
4. `tourPlan.sections`가 정확히 7개이며 순서와 ID가 1~7부로 이어지는지 확인합니다.
5. 각 미디어·근거 ID가 실제 응답의 자료와 연결되는지 확인합니다. 사진은 전체 8건 이하, 영상은 전체 3건 이하인지 확인합니다.
6. 세림아파트의 직접 과거 자료가 부족하면 이를 미확인으로 유지하고, 마장동 배경자료를 건물 이력으로 바꾸지 않는지 확인합니다.
7. 동일한 종합 해설 요청을 5회 실행합니다. 완성된 문장 자체가 같을 필요는 없지만, 7부 순서·주요 근거 ID·미디어 공간 범위·미확인 표시가 일관적인지 확인합니다.
8. 각 실행의 MCP 도구명과 request ID를 기록합니다. API 응답이나 출처를 직접 확인하지 않았다면 검증 완료라고 기록하지 않습니다.

이 주소에 대한 로컬 픽스처 테스트는 실제 운영 API 호출이 아니므로 운영 실증을 대체하지 않습니다.

## 확인할 기존 기능과 비용

- `search_place`, `get_place_history`, `prepare_place_answer`, `validate_place_answer`, `generate_place_answer`가 기존 이름과 인수 계약으로 응답하는지 확인합니다.
- MCP Apps 사진 갤러리에서 제목·이미지·출처가 같은 자료로 표시되는지 확인합니다. 표시 실패 때 검색 이미지로 대체하지 않습니다.
- 운영자 AI 호출 수가 0인지 확인합니다. 클라이언트 AI 응답 비용과 응답 시간은 별도 측정값으로 취급합니다.
- `semanticVerification: not_checked`가 유지되는지 확인합니다. 구조 검증 통과를 역사 내용의 의미 검증 완료로 표시하지 않습니다.

## 배포 실패 시 복구

1. MCP 도구 오류·응답 계약 위반·잘못된 장소 연결을 기록하고 추가 변경을 멈춥니다.
2. Vercel에서 Production이 실제로 사용 중인 배포와 직전 정상 배포 SHA를 확인합니다.
3. 배포 담당자가 Vercel의 이전 정상 배포 복구 절차로 되돌리고 `/health`, `/mcp` initialize 및 `tools/list`를 재확인합니다.
4. 이 PR은 DB 마이그레이션을 포함하지 않으므로 운영 데이터 롤백을 시도하지 않습니다. 장애 내용과 복구 SHA를 PR #76에 기록합니다.

## 현재 검증 기록

같은 Node.js v22.21.1과 동일 `node_modules`로 기준 `main` SHA `0e935df84108b9ad89fb6415383354f4af0b1da8`과 PR 작업 트리를 비교했습니다.

| 실행 | 전체 | 통과 | 실패 |
|---|---:|---:|---:|
| 기준 main | 407 | 390 | 17 |
| PR #76 | 421 | 405 | 16 |

PR에는 기준 main 대비 신규 실패가 없습니다. 16개 실패 테스트의 이름과 오류 메시지가 양쪽에서 모두 일치했습니다. 오류 원인은 크게 둘로 확인했습니다.

- 10개는 저장소에 있는 조사자료와 테스트의 고정 기대값이 다릅니다. 예: 제출 영상 보고서 SHA 기대값 `a60eff…` / 실제 `1dbb76…`, 최종 master 레코드 수 `7468 !== 5394`, 11개 export byte 수 `429173 !== 420418`, 구별 research 배치 수 `5319 !== 3832`. 이 테스트들은 로컬 자료·export를 대상으로 하며 이번 PR에서 자료 파일은 수정하지 않았습니다.
- 6개는 비동기 API route를 동기 함수처럼 호출하는 테스트 오류입니다. 실제 메시지 예: `photoGET(...).json is not a function`, `query(...).json is not a function`, `response.json is not a function`. 이 실패도 main과 PR에서 같습니다. 이 PR 범위와 무관하므로 테스트나 원본 자료를 바꿔 통과시키지 않았습니다.
- 기준 main에서만 추가로 실패한 MCP transport 테스트는 오래된 기대값에서 JSON Accept를 406으로 요구하지만 실제 최신 계약은 200을 반환한다는 `200 !== 406`입니다. PR 브랜치의 계약 테스트는 최신 main 동작에 맞춰 수정되어 통과합니다.

이번 보완 검사 결과:

- `npm run typecheck`: 통과
- `tests/docent-tour-v2.test.mjs`와 `tests/mcp-http-audit.test.mjs`: 22/22 통과
- 수정 대상 TypeScript/테스트 파일 ESLint: 오류 0건, 경고 0건. `lib/brief-docent.ts`의 `any` 타입과 해당 변경 영역의 불필요한 import 및 의도적으로 제거하는 이미지 마크다운의 unused 경고를 정리했습니다.
- 전체 `npm run lint`: 기본 Node 힙 4GB와 `NODE_OPTIONS=--max-old-space-size=6144` 모두 저장소 전체 검사 중 JavaScript heap out of memory로 중단했습니다. 전체 lint 성공으로 간주하지 않았습니다.
- `npm run build:mcp-public`, `npm run build:mcp-public:vercel`: 통과
- `npm run build:vercel`: 통과, 정적 페이지 48/48 생성
- 주소 픽스처 검증은 로컬 테스트입니다. 운영 API 주소 조회와 5회 반복 도슨트 실증은 아직 수행하지 않았습니다.

마지막 push 뒤에는 GitHub Actions와 Vercel Preview 상태를 다시 확인하고, PR #76의 설명에도 그 head의 결과를 기록합니다. 이 문서가 작성됐다는 사실만으로 Production 검증을 완료한 것은 아닙니다.
