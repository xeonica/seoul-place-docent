# 송정동 MCP 근거 생성 오류 진단

## 상태

**원인 확정 및 Production 수정은 미완료입니다.** 운영 MCP에서 송정4길 5의 실패를 다시 확인했지만, 현재 운영 진단 로그를 조회할 수 없어 최초 예외 단계까지 확정하지 못했습니다. 이 변경은 단계별 진단과 회귀 테스트를 준비하며 Production에는 배포하지 않았습니다.

## 확인한 운영 호출

2026-11-23, 연결된 `서울 역사 도슨트` MCP에서 두 주소를 같은 순서로 호출했습니다.

| 주소 | 검색 | 역사 조회 | 근거 준비 | 요청 ID |
|---|---|---|---|---|
| 서울특별시 성동구 송정4길 5 | 후보 1건 | 성공, 장면 6건 | 내부 오류 재현 | `5b3396bf-8cdd-4c2d-8370-5e61a5552dcb` |
| 서울특별시 성동구 마장로42길 16 | 후보 1건 | 성공, 장면 6건 | 성공, 7부 반환 | `fc5eab2f-2388-40e5-ba0c-ab31bcd2441b` |

송정동 반환 상태는 `placeEvidenceLinks=database_unavailable`, 현재 건축물대장 `identity_ambiguous`, 폐쇄말소대장 `no_records`였습니다. 마장동 대조 호출에서도 D1과 현재 건물 식별은 같은 미사용·모호 상태였지만 답변 근거 생성은 성공했습니다. 따라서 이 상태만으로 송정동 예외의 원인이라고 볼 수 없습니다.

운영 `get_answer_stats`도 `available=false`를 반환해, 사용자가 전달한 과거 요청 ID의 상세 실행 기록이나 서버 예외 스택을 현재 연결에서 확인하지 못했습니다. 직접 운영 URL 호출은 이 작업 PC에서 DNS 해석 오류로 막혔으나, 연결된 MCP를 통한 실제 운영 호출은 수행했습니다.

## 코드 변경

- `app/mcp/route.ts`: 근거 준비 경로를 주소 토큰, D1 장소 링크, 지역 fact, 동네 자료 구성, 건축물대장, 답변 packet, 영상, 사진, BigQuery 자료, 7부 tour, 이미지 블록, 직렬화 단계로 나눠 타이밍을 기록합니다.
- `lib/mcp-audit.ts`: 실패 로그에 요청 ID, 도구명, 단계, 안전한 오류 코드와 오류 종류를 기록합니다. 원문 요청, 주소 token, 비밀키, 예외 메시지는 기록하지 않습니다. 7부 검증 실패는 허용 목록 형식의 검증 코드만 로그에 남깁니다.
- MCP 도구 오류 응답에는 안전한 `errorCode`와 기존 요청 ID를 포함합니다.
- `tests/mcp-http-audit.test.mjs`: 송정동과 마장동 각각 `search_place → get_place_history → prepare_place_answer`를 같은 모의 서비스 조건에서 실행하는 회귀 테스트를 추가했습니다. D1 미설정, 건물 식별 모호, 폐쇄대장 0건, 필지 키 누락이 동네 역사 근거 생성을 차단하지 않고, 4부에 동네 자료를 건물 직접 역사로 승격하지 않도록 검사합니다.

이 테스트는 주소·자료 fixture 및 모의 외부 API에 대한 회귀 테스트이며, 실제 운영 주소 조회의 대체 증거가 아닙니다.

## 검증 결과

- `pnpm run typecheck`: 통과 (Node 24.22.3, pnpm 11.25.0)
- `pnpm run build:mcp-public`: 통과
- `pnpm run build:mcp-public:vercel`: 통과
- `git diff --check`: 통과
- `pnpm test`: 미실행. 로컬 실행기가 프로젝트 요구 Node 22가 아닌 Node 24.22.3을 선택했고, 테스트 스크립트의 `--experimental-transform-types` 옵션이 지원되지 않아 시작 단계에서 종료했습니다. Node 24의 strip-only 실행도 TypeScript parameter property 지원 오류로 중단되어, 테스트 성공으로 기록하지 않았습니다.
- 신규 송정동 fixture 테스트: Node 22에서 아직 실행되지 않았습니다.
- Vercel Preview: 아직 생성·호출 검증하지 않았습니다.
- Production 배포: 수행하지 않았습니다.

## 다음 확인 단계

Draft PR Preview에서 두 주소의 `prepare_place_answer`를 호출하고 Vercel 서버 로그의 `mcp_stage` 이벤트를 요청 ID로 대조해야 합니다. 첫 `ok:false` 단계와 `errorCode`가 나와야 예외 위치가 특정됩니다. 그 결과를 재현하는 수정과 Node 22 전체 테스트가 끝날 때까지 원인 확정 및 운영 복구를 완료로 처리하지 않습니다.
