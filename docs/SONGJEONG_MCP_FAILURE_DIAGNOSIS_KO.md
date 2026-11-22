# 송정동 MCP 근거 생성 오류 진단

## 상태

**송정동 재현 fixture의 예외 단계와 검증 실패 원인을 확인했습니다. Production은 미배포이며 Preview에서 수정본을 검증해야 합니다.** GitHub Actions의 송정동 회귀 테스트에서 최초 실패 단계는 `build_place_docent_tour_v2`였고 검증 코드가 `duplicate_returned_id`, `photo_asset_id_mismatch`로 확인됐습니다. 그 앞의 주소 검증, D1 조회, 지역 역사자료 구성, 건축물대장, `generatePlaceAnswer`, 영상·사진 후보, BigQuery 후보 조회, 좌표 단계는 성공했습니다. 운영 MCP 호출에 대해선 보호된 서버 로그를 읽을 수 없어 동일한 단계가 Production 요청에서도 발생했는지는 별도로 확정하지 못했습니다.

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
- `lib/docent-tour-builder.ts`: 7부 packet 생성 전에 사진을 근거 ID별로 정리합니다. 같은 근거 ID가 같은 자산(매체 ID, 원본 레코드 ID, 원문, 제목)을 가리키는 중복 행은 하나로 합칩니다. 같은 ID가 서로 다른 자산을 가리키면 임의 이미지를 선택하지 않고 해당 충돌 후보를 제외해 검증 계약을 유지합니다.
- `tests/docent-tour-v2.test.mjs`: 동일 자산 중복은 단일 photo asset으로 정리되고, 상충하는 자산 ID는 표시·근거 목록에서 빠지며 최종 계약 검증이 통과하는지 검사합니다.

이 테스트는 주소·자료 fixture 및 모의 외부 API에 대한 회귀 테스트이며, 실제 운영 주소 조회의 대체 증거가 아닙니다.

## 검증 결과

- `pnpm run typecheck`: 통과 (Node 24.22.3, pnpm 11.25.0)
- `pnpm run build:mcp-public`: 통과
- `pnpm run build:mcp-public:vercel`: 통과
- `git diff --check`: 통과
- `pnpm test`: 로컬 실행 불가. 셸에서 `node`가 v26.13.1로 선택되어 프로젝트가 요구하는 Node 22 옵션 `--experimental-transform-types`를 인식하지 못해 테스트 초기화 전에 종료됐습니다. `pnpm`도 Node 24.22.3 엔진 불일치 경고를 출력합니다.
- 이전 PR 커밋의 GitHub Actions `test` (Node 22): 405개 중 404개 통과, 1개 실패. 실패는 이번에 추가한 송정동 fixture 테스트이며, 위의 tour-builder 검증 오류를 재현했습니다. CI의 `types`는 통과했습니다. CI의 `contract` 및 `public-mcp`는 이 동일 실패 테스트로 실패했습니다.
- 수정 후 PR #100 Node 22 CI: 전체 406개 테스트 통과, 실패 0건. 송정동·마장동 흐름 회귀 테스트와 중복 사진 ID 검증 테스트도 통과했습니다. `types`, `contract`, `public-mcp` 검사도 모두 통과했습니다.
- Vercel Preview: 아직 생성·호출 검증하지 않았습니다.
- Production 배포: 수행하지 않았습니다.

## PR Preview 실증 및 잔여 단계

최신 PR Preview `https://seoul-place-docent-mcp-git-codex-songjeo-aa5184-smn0365465-1518.vercel.app`에서 `/health`가 HTTP 200과 `ready`를 반환했습니다. MCP HTTP 호출도 실제 실행했습니다.

| 주소/도구 | 실제 Preview 결과 |
|---|---|
| 송정4길 5 `search_place` | 후보 1건 |
| 송정4길 5 `get_place_history` | 장면 6건 |
| 송정4길 5 `prepare_place_answer` | 정상, 7부, 사진 1건, 4부는 `missing` 유지 |
| 송정4길 5 `generate_place_answer` | 정상, 7부 |
| 마장로42길 16 `search_place` | 후보 1건 |
| 마장로42길 16 `get_place_history` | 장면 6건 |
| 마장로42길 16 `prepare_place_answer` | 정상, 7부, 4부는 `missing` 유지 |

Preview MCP initialize는 프로토콜 버전 `2025-11-25`로 성공했고 `tools/list`는 11개 도구를 반환했습니다. Preview에서 D1 및 건물 식별 상태가 선택적 실패로 반환되어도 두 주소의 근거 packet 생성이 성공했으며, 동네 자료는 4부의 직접 건물 이력으로 승격되지 않았습니다. 진단 저장소는 `auditConfigured=false`이므로 Preview 서버 내부 `mcp_stage` 로그의 개별 이벤트는 조회하지 못했습니다.

PR #100 최신 커밋 `191c26a7c0a642a5912cc21f346a5b7db6e2f1e3`에서 Node 22 GitHub Actions 406개 테스트가 모두 통과했고 `types`, `contract`, `public-mcp`, Vercel Preview 빌드도 통과했습니다. Production은 미배포이며, 운영 MCP의 요청 ID에 대한 최초 예외는 운영 서버 로그 접근 권한이 없어 독립 확인하지 못했습니다. 이 PR 병합 후 Production 배포와 동일한 MCP 호출 재검증은 별도 진행이 필요합니다.
