# 건축물대장·폐쇄말소대장 이력 연결 구현 및 검증

기준 브랜치 `main`의 커밋 `f926383af07d14a086e77e0f443bc41eba35e614`에서 작업했다. 이 변경은 MCP의 기존 `get_place_history` 및 `prepare_place_answer` 응답에 진단 정보를 추가하고, 7부 자료 배정에서 현재 건물 대장과 과거 대장 후보를 분리한다.

## 구현

- 현재 건축물대장 API의 페이지·응답 스키마를 확인하고, 최대 20페이지까지 조회한다. 페이지 상한까지 읽고도 전체 건수를 가져오지 못하면 `identity_ambiguous`로 처리한다.
- 폐쇄말소대장 API를 최대 20페이지까지 수집한다. 폐쇄 유형 코드명·코드와 제공되는 폐쇄말소일을 보존한다.
- 빈 성공 응답(`no_records`)과 키 누락, 인증 거부, 조회 오류, 응답 스키마 오류를 구분한다. API 오류를 자료 없음으로 바꾸지 않는다.
- 현재 대장은 건축물대장 PK, JUSO 건물관리번호, 주소에서 도출한 PNU를 별도 필드로 보존한다. 이름과 도로명주소가 유일하게 맞지 않으면 건물 사실로 승격하지 않는다.
- 폐쇄말소대장 행은 동일 지번 후보(`same_parcel_historical_candidate`)로만 반환한다. 행정상 폐쇄 유형만으로 철거·동일 건물·이전 부지를 단정하지 않는다.
- 1부에는 검증된 현재 건축물대장만 제공한다. 4부에는 과거 대장 후보를 미확정 자료로 표시하고, 기존 승인된 직접 역사 근거와 구분한다. 동네 배경 자료는 계속 별도 범위로 유지한다.
- 기존 MCP 입력·도구 구조를 유지하고 `structuredContent.registerDiagnostics`와 본문에 상태를 추가했다.

## 공식 자료원

- [국토교통부 건축물대장정보 서비스](https://www.data.go.kr/data/15134735/openapi.do)
- [국토교통부 폐쇄말소대장정보 서비스](https://www.data.go.kr/data/15137093/openapi.do)
- [건축HUB 폐쇄말소 유형 코드](https://www.hub.go.kr/portal/opn/tyb/idx-cler.do)

## 세림아파트 실사용 상태

검증 주소는 서울특별시 성동구 마장로42길 16(세림아파트)이다. 이 실행 환경에서 `BUILDING_API_KEY`, `CLOSED_BUILDING_API_KEY`, `VWORLD_API_KEY` 값은 설정되지 않았다. 따라서 실제 공공 API를 호출하지 않았으며, 세림아파트의 현재 건축물대장·폐쇄말소대장·PNU 결과를 확인했다고 보고할 수 없다. 런타임에서는 해당 상태를 `key_missing`으로 반환하도록 했다. 환경 변수 이름은 기존 `.env.vercel.example`의 서버 전용 이름을 재사용한다.

실제 조회를 완료하려면 Vercel의 해당 Preview/Production 환경 설정에 세 키를 서버 환경 변수로 등록하고 새 배포를 만든 뒤, 같은 주소로 `search_place` → `get_place_history` → `prepare_place_answer`를 호출해 각 응답의 `registerDiagnostics`를 확인해야 한다. 이번 작업은 운영 변수·D1·BigQuery·R2를 변경하지 않았다.

## 테스트와 빌드

- 신규 `tests/building-register.test.mjs`: 현재 대장 식별자 분리, 과거대장 다중 페이지 수집, 빈 결과와 키 누락 분리, 복수 현재 대장 모호성, 1부·4부 범위 분리.
- MCP 및 연관 계약 테스트: 로컬 선택 실행은 69개 중 68개 통과였다. 실패 1개는 사진 미리보기 권한 테스트로, 대장 연동 코드와 무관한 사진 프리뷰 URL 경로에서 발생했다.
- GitHub Actions Node 22 (v22.23.5), 최종 커밋 `237c4b2ca9947d54d3ae6bf2f24f3ee66810112c`: MCP/evidence 계약 테스트 통과, 공개 MCP 빌드·통합 테스트 통과, 타입 검사 통과. 계약 워크플로에서 기존 사진 권한 실패 테스트는 대장 회귀 테스트 파일과 분리해 유지했다.
- 전체 로컬 테스트: 375개 중 357개 통과, 18개 실패. 실패는 사진·영상 조사자료/내보내기 및 사진 미리보기 테스트에 집중되어 있다. 이 18개를 기준 커밋에서도 실행해 비교하지 않았으므로 기존 실패라고 확정하지 않는다.
- 로컬 Node는 `v26.13.1`로 프로젝트 요구 버전 Node 22와 다르다. 기본 `pnpm test`는 Node 22 전용 `--experimental-transform-types` 옵션을 이 로컬 런타임이 지원하지 않아 실행되지 않았다. 선택 테스트와 전체 로컬 테스트는 임시 변환 로더로 실행했으며, Node 22 결과는 GitHub Actions에서 별도로 통과했다.
- `pnpm run typecheck`: 로컬 통과 및 Node 22 GitHub Actions 통과.
- `pnpm run build:mcp-public`, `pnpm run build:mcp-public:vercel`: 로컬 통과. Node 22 공개 MCP Build Output 및 통합 검증도 GitHub Actions에서 통과.

## 남은 확인

1. Node 22 GitHub Actions 전체 테스트 및 이 변경으로 추가된 신규 실패 여부.
2. 공공 API 키가 설정된 별도 Preview에서 세림아파트의 실응답, 건물관리번호/PNU, 페이지네이션을 확인.
3. 공식 폐쇄말소 자료에서 반환되는 과거 레코드가 있을 경우, 과거 건물 PK·명칭·폐쇄 유형·시점과 현재 대장 및 D1 승인 근거를 사람이 대조. 자동으로 직접 역사나 철거 사실로 승격하지 않는다.

실제 API 응답을 받기 전까지 건물·필지 과거 이력은 미확인이다.
