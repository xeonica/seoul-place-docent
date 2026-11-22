# 서울 도슨트 PR #78 Phase B 진행 보고

작성일: 2026-11-22 (Asia/Seoul)
대상 PR: https://github.com/xeonica/seoul-place-docent/pull/78

## 요약

PR #78의 7부 해설 구조를 유지하면서, 승인된 현행 D1 지역 근거를 검색하는 경로와 지명·사건·사진 시간 메타데이터 계약을 보강했다. 새 조회는 건물·필지 직접 근거가 아니라 법정동·자치구 맥락만 돌려준다. D1 직접 장소 링크가 비어도 기존 동네 장면은 그대로 유지한다.

서울 25개 구 주소 검색과 역사자료 연결 검증은 완료되지 않았다. 현재 저장소의 125개 주소 표본은 구청·도서관·초등학교·시장·주민센터 유형의 주소 검색 후보 일치 자료이고, 요청한 아파트·역사적 장소 표본도 아니며 MCP Preview 실호출 결과도 아니다. 역사자료·사진·영상의 연결 성공을 주소 검색 성공으로 계산하지 않았다.

판정: **Phase B 일부 코드 구현 완료 / 서울 전역 실증 BLOCKED**. PR은 Draft 상태로 유지하고 main 병합·Production 배포는 하지 않았다.

## 실제 코드 변경

- `lib/historical-records.ts`: 지명 후보, 승인 fact, 역사 사건의 자료형을 분리했다. 현재·과거 지명 이름, 범위, 기간, 출처 표제와 URL을 별도 저장하며 현재 동의 법정동/행정동 구분을 확정할 수 없으면 `unresolved`로 둔다.
- `lib/archive-db.ts`: 현재 버전의 승인 fact를 구·법정동 계층, 원문 URL, 검토된 passage로 조회한다. fact/source `content_checked`, 활성 passage review, 스냅샷 일치가 모두 필요하다. 유효하지 않은 후보나 동네 자료는 exact-site 근거가 되지 않는다.
- `lib/docent-tour-integration.ts`, `lib/docent-tour-builder.ts`, `lib/docent-tour-schema.ts`: 지명은 `historical_area_candidate`로, 사건일과 발행일은 서로 다른 필드로 투어 구조화 응답에 담는다. 원문 근거가 승인된 사건만 3부 evidence에, 지명 fact만 2부에, 도시공간 fact만 5부에 연결한다. 장소 직접 근거가 없으면 4부를 미확인으로 남긴다.
- 기존 옛 지명 조사 27건은 6개 구에 걸친 출처 후보로 반환한다. 데이터 내 12개 항목이 공식 페이지 본문 확인으로 기록되어 있고, 그 인용 URL은 5개로 중복 제거된다. 나머지는 보류한다. 모두 과거 경계와 현재 법정동/행정동의 공간 일치가 검증되지 않아 후보이며, 이 목록으로 사실 문장을 생성하지 않는다.
- 사진 메타데이터에서 촬영일·발행일·촬영 위치·피사체 위치·방향·비교 그룹을 분리한다. 검증 플래그가 없으면 위치와 과거·현재 비교를 승인하지 않는다. 기존 사진 8장/영상 3개 제한은 유지한다.
- `app/mcp/route.ts`: D1의 장소 직접 자료와 지역 역사 자료 조회를 병렬 호출하고, 연결 실패 시 기존 동네 장면을 보존한다.

## 데이터·주소 검증 현황

- 저장소 내 기존 주소 표본: 25개 구 × 5건 = 125건. 기존 CSV는 표본 주소 검색 일치만 기록한다. 유형은 구청·도서관·초등학교·시장·주민센터다.
- 25개 구 아파트/시장/학교/역사 장소/공공건물 요구 유형별 표본: 미완료. 기존 표본은 요청한 유형 구성을 충족하지 않는다.
- 25개 구의 해당 주소 대상 실제 PR Preview MCP 요청: 미실행. 기존 주소 CSV가 Preview MCP 통과를 증명하지 않는다.
- 지명 후보: 27개 / 6개 구. 원문 내용·현재 경계·현대 주소와의 공간 일치가 확인된 지명 사실 수는 미측정.
- 사건 fact와 승인된 원문·발행일: Preview D1 접근 불가로 미측정. 기사·영상 간 사건 ID 연계와 검증 구간 적용도 미완료.
- 직접 건물·필지 자료, 사진·영상 원본 URL/라이선스/표시권, 고지도·항공사진의 촬영 위치/피사체 위치와 동일 장소 비교 승인: 미측정. 임의의 0건으로 기록하지 않았다.
- Preview D1 격리 및 스키마 상태: 확인하지 않았다. 기존 MCP `get_archive_stats` 도구 호출은 `INVALID_ARGUMENT` 오류를 반환했고 통계 결과가 없었다. 따라서 운영 D1 자료량을 검증한 것으로 간주하지 않는다.

세부 25개 구 표본 상태: `outputs/seoul-phase-b-district-status.csv`
기존 주소 표본 원본: `docs/seoul-address-validation.csv`

## 기준 비교 및 테스트

PR 기준 SHA `320d7e0fa7c81f268b9c578776f5d2e7f2be3609`, 당시 main SHA `db568907748119875693feaf7b9db09574c9555c`를 비교했다. 현재 작업 브랜치는 같은 PR #78 head에서 시작했다.

Node와 의존성 버전을 맞춘 로컬 비교는 동일한 Node `24.22.3`, pnpm `11.25.0`, 동일 lockfile/node_modules 조건에서 실행했다. 저장소는 Node 22를 요구하므로 Node 24 실행은 엔진 경고가 있다. PR의 이전 GitHub Actions는 Node 22에서 typecheck/public MCP/contract가 통과한 기록이 있었지만, 이 작업 후 CI 기록은 push 후 재확인 대상이다.

- 기준 main: 329개 테스트, 310 통과, 19 실패
- PR #78 기준 head: 354개 테스트, 336 통과, 18 실패
- Phase B 수정본: 360개 테스트, 342 통과, 18 실패
- 기존 PR 실패 18개가 그대로 남았고 이번 변경의 신규 실패는 없다. 기준 main에서만 실패하고 PR에서 수정된 HTTP Accept 테스트 1개는 계속 통과한다.
- 추가 집중 테스트: 21/21 통과. 실제 메모리 SQLite + 모든 기존 migration으로 current content review, 승인 fact 조회, 본문 수정 후 review 만료를 확인했다.
- TypeScript: 통과
- Next.js Webpack production 빌드: 통과
- 공개 MCP 패키지 빌드: 통과
- 공개 MCP Vercel 빌드: 최종 변경 후 통과.

PR 기준과 수정본에 공통으로 남은 18개 실패명:

1. `submitted video groups, exclusions and original report fingerprints remain traceable`
2. `all eight accumulated tables have matching download counts and hashes`
3. `API paginates, validates table/target, and exports all rows matching the current filters`
4. `one final master supplies records while incremental files and exclusions remain audit evidence`
5. `all eleven unmodified exports are downloadable and final state agrees with the accepted master`
6. `shared originals are grouped across surveys and obsolete IDs resolve to current records`
7. `support API validates tables, paginates, and keeps held and excluded records distinct from accepted photos`
8. `fifty-six research batches preserve original downloadable bytes and district versus dong scope`
9. `accessibility, review and reproduction permissions are independent original fields`
10. `annotated search URLs are separated from source notes without inventing detail pages`
11. `combined neighborhood and candidate filters match their supplied scope rather than a homonym`
12. `photo API paginates, validates batch IDs, and exports complete filtered original data`
13. `district cumulative files retain missing sequence notices and stay separate from address matches`
14. `building correction rows preserve original IDs and facts while type and media filters export independently`
15. `Seongdong collection preserves all 107 raw rows and separates bridge construction dates from unverified photograph dates`
16. `Nowon shares one unmodified CSV across five dong batches and preserves common-file row numbers`
17. `Mapo research targets preserve the neighboring district and qualified original place labels`
18. `a public image URL alone cannot enable a thumbnail, and unknown permissions stay unchanged`

실패 원인은 기준 main과 PR 기준 head 양쪽에서 재현된다. 대부분 기존 조사 CSV의 예상 건수/해시와 현재 데이터 불일치, 사진 API fixture가 `Response.json()` 대신 단순 객체를 반환하는 테스트 mock 불일치, 사진 표시권 기대값 불일치다. 별도 조사가 필요한 기존 실패로 분류했고 본 Phase B 변경과 무관하게 수정하지 않았다.

## 미완료 및 다음 단계

1. Preview MCP 및 Preview 전용 D1 연결·분리를 확인하고 읽기 전용 주소 조회부터 실증한다.
2. 25개 구마다 요청한 5개 유형(아파트·시장·학교·역사 장소·공공건물)의 공식 주소 125건을 준비하고 주소 검색과 장소 식별을 따로 기록한다.
3. 기존 27개 옛 지명 후보의 행정동/법정동 구분, 해당 시기·경계, 원문 본문을 검토한다. 현재 동명에 정확히 붙이지 말고 확인 수준별로 승인한다.
4. 승인된 사건 fact가 실제 D1에서 조회되는지 확인하고 사건 발생일·기사 발행일 및 원문 passage를 대조한다.
5. 기사·영상·사진을 사건 ID로 연결하는 저장·검토 경로, 검증된 영상 구간, 사진 권리·원본·촬영/피사체 위치, 고지도 비교 근거를 완성한다.
6. 최종 수정 후 Node 22 환경에서 테스트와 Vercel 공개 MCP 빌드를 재실행하고, PR CI 및 Preview MCP 호출 결과를 기록한다.

**Phase C 진행 가능 여부: BLOCKED.** 코드 기반은 들어갔지만 Preview D1 접근, 125개 요구 유형별 실주소, 공식 사건·사진·영상의 실제 장소 연결 실증이 남아 있다. 이 환경에서는 운영 DB나 Production 배포를 변경하지 않았다.