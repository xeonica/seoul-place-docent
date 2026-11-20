# 서울 도슨트 통합 검증 보고서

검증일: 2026-11-20. 대상: `xeonica/seoul-place-docent`, 통합 브랜치 `codex/integrated-docent-release`, [PR #69](https://github.com/xeonica/seoul-place-docent/pull/69).

## A. 기존 문제 원인

| 구분 | 확인 결과 |
| --- | --- |
| 미병합 | #47·#63·#64·#65·#66은 조사 시점 모두 Open/Draft였다. main에 승인 기사·영상 파이프라인과 새 지도·사용 추적 구조가 없었다. |
| 기존 기능 중복 | main에는 이미 MCP Apps 갤러리·이미지 프록시가 있다. 이를 새로 만들지 않고 원본 검증·입력 형태·오류 대체 동작을 통합했다. |
| 코드 오류 | 갤러리가 초기 `visuals.photos` 입력을 읽지 못하는 경우, 대체 이미지 URL 검사 오류, 지도 좌표 누락·이전 핀 잔존, SDK 동기 예외를 수정한 #66을 재사용했다. |
| 최신 main과 충돌 | #67이 아카이브 허용 도메인 전체를 프록시로 보내도록 변경했다. 사진 원본/권리 검증을 유지하면서 이 동작을 보존했다. |
| 데이터·승인 부족 | 운영 응답의 영상 후보 3건은 내용·장소를 확인한 근거가 아니다. BigQuery `ready`도 검토된 기사나 장소 연결을 증명하지 않는다. D1 현재 승인 레코드와 원문 인용/AI 권리가 있어야 새 기사·영상의 확정 주장이 제공된다. |
| 클라이언트 제약 | MCP 응답은 최종 AI의 인용이나 ChatGPT 자체 지도 표시를 강제하지 못한다. 실제 사용 ID는 제출된 문단·주장을 검증한 결과와 구분해서 추적한다. |

## B. 기존 PR 선택 통합

조사 당시 상태이며, 이전 PR들을 일괄 병합하지 않았다.

| PR | 당시 상태 / main 포함 | 통합 판단 |
| --- | --- | --- |
| #47 `428a3f0` | Open/Draft, 미포함 | 구별 50개 분할 인덱스·기사/사진 주소 검색·자료실 API를 선택 통합. 오래된 MCP 응답 전체 교체는 제외. 최신 사진 공개 검증을 보존했다. 후보 타입의 `video` 누락도 수정했다. |
| #63 `75ea476` | Open/Draft, 미포함 | 기록 ID·원본 이미지·원문·권리 연결 검증 적용. 기존 main 갤러리/프록시를 중복 생성하지 않았다. |
| #64 `0adf99e` | Open/Draft, 미포함 | D1 감사 가능한 승인·권리·주장 및 영상 구간 검증, BigQuery v2 이행 코드 적용. 실제 운영 D1 마이그레이션·BigQuery v2 실행은 별도 미완료다. |
| #65 `2e1030a` | Open/Draft, 미포함 | 출처별 현장 해설 계획·시간 측정·공개 조회 캐시 적용. 운영자 모델 호출을 추가하지 않았다. |
| #66 `09ca4de` | Open/Draft, 미포함 | 갤러리 v6 및 v4/v5 호환, 사진 실패 원문 링크, 공식 좌표·지도 대체 경로 적용. |
| #67 `b1a9969` | main에 이미 병합 | 허용 아카이브 이미지의 프록시 동작 유지. 통합 시 `place-answer.ts`와 이미지 테스트 충돌을 수동 해결했다. |

이전 PR의 Preview 성공은 단위 테스트나 Production 반영의 증명이 아니다. 통합 후 전체 테스트와 두 빌드를 다시 실행했다. #47의 오래된 `generate/prepare` 구현과 사진 검증 이전 코드를 그대로 덮어쓰지 않았다.

## C. 실제 구현

- `lib/story-evidence.ts`: 현재 승인된 `CommonEvidence`만 기사·영상·사건 구조로 변환한다. 기사는 원본 ID·제목·언론사·발행일·사건일·허용 발췌·장소 관계·권리를 유지한다. 영상의 검토된 주장과 검증된 재생 구간을 분리하고 촬영일은 확인되지 않으면 null이다.
- `storytelling.historicalEvents`: 승인된 개별 주장마다 사건 ID와 문헌·기사·사진·영상 근거 ID를 제공한다. 날짜·동네가 같다는 이유로 별개 사건을 합치지 않는다. 사진 연결도 같은 원문과 검증 이미지가 있는 범위만 허용하며 피사체 동일성까지 보증하지 않는다.
- `app/mcp/route.ts`: `prepare_place_answer`의 텍스트/구조화 응답에 `storytelling`을 추가하고 기존 필드·도구를 유지한다. `validate_place_answer`는 제출된 문단/주장의 `usedEvidenceIds`, `rejectedEvidenceIds`, 검증 범위를 반환한다. 미제출 답변이나 실제 이미지 렌더링을 관측했다고 표시하지 않는다.
- `lib/place-evidence.ts`, `lib/history-search.ts`, `lib/district-history-index.ts`: 기존 기사·영상/BQ 후보 및 현재 승인을 병렬 조회하고 #47의 주소별 조사 후보를 연결한다. 후보는 자료형별 최대 5건씩 반환한다. 후보 메타데이터만 5분/32개 캐시하며 D1 승인·권리는 캐시하지 않는다.
- `lib/video-records-asset.ts`, `.cloudflare.ts`: Node는 패키지 로컬 파일, Sites는 `ASSETS`로 분할 자료를 읽는다. 외부에서 자기 서버를 재호출하던 비용과 실패 지점을 제거했다.
- `scripts/build-public-mcp*.mjs`, `next.config.ts`: 50개 압축 분할 자료를 실제 MCP 패키지/Next 추적 대상에 포함한다. 25개 구의 기사 25,535건·사진 25,210건, 합계 50,745건을 보존하는 테스트를 수행했다.
- `lib/deployment-info.ts`, `deploy/public-mcp/entry.ts`: `/health`에 런타임이 제공한 Git SHA·배포 환경·응답 스키마·갤러리 URI·좌표/승인 백엔드 설정 여부를 추가했다. SHA가 없으면 null이며 브랜치명을 SHA처럼 쓰지 않는다. 비밀값은 반환하지 않는다.
- 보완 테스트: `tests/story-evidence.test.mjs`, `history-search.test.mjs`, `photo-map-display.test.mjs`, `reviewed-evidence.test.mjs`, `photo-verification.test.mjs`. 사진 보안 API 테스트는 변경된 로컬 자산 방식에 맞춰 테스트 전용 메모리 fixture를 사용하고 종료 시 복구한다.

상속한 사진·지도 수정 파일은 [사진·지도 보고서](photo-map-display.md), D1 승인과 BigQuery 운영 절차는 [근거 파이프라인 보고서](reviewed-evidence-pipeline.md)를 함께 참조한다. 추가 운영자 LLM 호출, 기사 전체 본문 복제, 영상 재배포, 원본 사진/GPS 서버 저장은 도입하지 않았다.

## D. 실제 실행한 테스트

Node 22.21.1에서 실행했다. `node`는 해당 버전 실행 파일을 의미한다.

```powershell
node scripts/pack-video-records.mjs
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/*.test.mjs
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/photo-map-display.test.mjs tests/reviewed-evidence.test.mjs tests/story-evidence.test.mjs tests/history-search.test.mjs tests/image-proxy.test.mjs tests/photo-verification.test.mjs
node node_modules/next/dist/bin/next build --webpack
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/run-framework.mjs build
node scripts/build-public-mcp-vercel.mjs
node --test tests/public-mcp-package.integration.mjs tests/public-mcp-node.integration.mjs
```

| 검사 | 결과 |
| --- | --- |
| 전체 자동 테스트 | **398건 중 382 통과·16 실패**. 변경 전 17개 실패 중 기사 API의 비동기 테스트 1건이 해결됐고 새로운 실패 이름은 없다. |
| 사진·지도·승인·기사·영상·구별 검색 관련 테스트 | **55/55 통과**. 캐시 추가 후 전체 테스트에서도 다시 실행했다. |
| Next / 타입 검사 | 성공. 통합에서 발견한 영상 후보 타입 누락은 수정 후 재실행했다. |
| Sites | 성공. 일부 동적 라우트 정적 분류에 관한 기존 vinext 안내는 남는다. |
| 공개 MCP 패키지 / HTTP 통합 | 빌드 성공·**3/3 통과**. 외부 API 성공 사례는 fixture다. |
| 운영 MCP 검색→역사→prepare→AI 해설→validate | 실행. 아래 F의 두 문단이 mechanical_only 검증을 통과했다. 새 코드의 운영 검증과는 구분한다. |
| ChatGPT 브라우저 사진·지도 / 모바일 | 미실행. |

남은 16개 실패는 기존 조사자료의 건수·해시·원본 CSV 상태 기대값 불일치, 이전 테스트의 비동기 API await 누락이다. 새 데이터에 맞춰 기대값을 일괄 완화하지 않았다. 상세 로그는 로컬 `outputs/integration-all-tests.log`에 있다. 변경 전 17개와 비교해 새 실패 이름이 없음을 확인했다.

로컬에서는 외부 API를 끄고 실제 패키지 자료와 주소 서명 fixture로 10회 측정했다. 후보 캐시 전 반복 요청 중앙값 약630ms, 추가 후 첫 요청783ms·반복 중앙값34ms, HIT였다. 이는 운영·네트워크·사용자 AI 생성 지연이 아니다. 새 좌표 조회는 병렬이며3.5초 상한을 두었다. 느린 공식 API의 대기 시간을 없앴다고 주장하지 않는다. 승인·권리는 매번 재검사한다.

## E. 배포 상태

- 조사 시점 main: `b1a9969cafcea422ef34fdc71efb0d537e1595c9`.
- 공개 GitHub deployments 기록: ID `7938899062`, 같은 SHA, 환경 Production, 상태 success, 2026-11-20 10:09:27 UTC. 대상 URL: https://seoul-place-docent-d6sofcit1-smn0365465-1518.vercel.app
- 공개 운영 MCP /health: HTTP200, 주소 설정·감사 설정 있음, 모델 호출0. 구 운영 응답은 SHA를 갖지 않아 운영 별칭의 SHA를 응답에서 직접 확인한 것은 아니다.
- Vercel CLI 로그인은 shclfclf16, 접근 가능한 팀도 동명 팀뿐이다. 운영 smn0365465-1518 범위는 접근 불가였다. 이 인증으로 운영 환경변수 목록·설정 변경·직접 재배포를 수행하지 못한다.
- 기존 Sites ID를 유지했다. 조회 결과 version60과 기존 URL은 확인했지만 현재 연결의 role/access는 null이다. Sites 코드 재배포는 수행하지 않았다.
- 통합 코드 커밋 `16344b90fa4972a5431817903d55a0a27ab36f23`. 조사 시점 main/Production과 별개다. 이후 배포 관측은 이 문서의 추기 및 PR 체크를 참조한다.
- 통합 PR #69의 해당 커밋은 Vercel 봇에서 Preview Ready로 확인했다. Preview URL은 `https://seoul-place-docent-mcp-git-codex-integra-6a645d-smn0365465-1518.vercel.app`이다. 직접 HTTP 접근 결과는 로컬 `outputs/integration-preview-probe.json`에 기록했다.

비밀값은 공개하지 않았다. 공개 health의 참·거짓 값은 완전한 환경변수 감사가 아니다. D1/R2 자격증명, BigQuery OIDC, 건축물대장 키, 카카오 콘솔 허용 도메인은 운영 팀에서 최종 확인해야 한다.

## F. 센트라스 도슨트 실증

이 채팅의 AI가 연결된 운영 MCP를 호출한 실증이며 ChatGPT 브라우저 UI 검사는 아니다. 안전한 관측 데이터와 실제 제출 해설은 [관측 JSON](integrated-docent-centras-observation.json)에 보관했다. 주소 token·인증키·사진 원본·사용자 GPS는 포함하지 않는다.

1. **MCP가 찾은 자료:** 왕십리로410, 하왕십리동1070, 센트라스로 식별했다. 문헌/주장 ID와 박물관 사진 ID를 반환했다. 영상 후보는 video-048a3f87ba30e81da073, video-5ca09811cb901cc41fb6, video-b220fc3f22da0e9e87c7이다. 후보를 확정 근거로 승격하지 않았다.
2. **검증·승인 범위:** 사용한 박물관 사진의 제목·2009년·이미지/원문의 fileId를 대응시켰다. 하왕십리동 배경이며 현재 센트라스의 직접 사진은 아니다. 현 운영 응답에는 새 D1 승인 ledger가 없어 승인 기사·영상 수를 추정할 수 없다. 이미지와 원문의 연결 확인과 역사 사실의 독립적 의미 검증도 별개다.
3. **최종 해설에 실제 사용:** seoul-museum-5039, seoul-museum-5040. 이 AI가 아래 두 문단을 만들고 같은 token/question으로 운영 validate에 제출했다. valid:true, omitted:0, verification:mechanical_only. 새 코드에서도 같은 제출을 로컬로 실행해 usedEvidenceIds가 이 두 건임을 확인했다.
4. **아직 사용할 수 없는 자료:** 영상 후보3건의 실제 영상 내용·시각, 미승인 기사, 개별 필지와의 관계가 미확인인 문헌·사진, 미확인 건축 이력. 빈 승인 목록을 곧바로 자료 부재라고 단정하지 않고 백엔드 미설정/미이행을 구분한다.

실제로 제출한 해설:

> 센트라스가 있는 하왕십리동에서 시선을 주변의 옛 주거지로 넓혀 보겠습니다. 서울역사박물관의 2009년 기록에는 청계천과 무학로에 접한 조밀한 주거지역과 한옥·변형된 한옥, 다세대연립주택, 소규모 공장이 함께 등장합니다.

> 늘우물길 주변 사진에는 슬레이트 지붕의 금형공장들이 밀집한 모습이 기록되어 있습니다. 이 사진들은 센트라스 건물 자체의 과거 사진이 아니라, 당시 주변 동네의 주거와 일터를 함께 살펴보는 자료입니다.

출처는 서울역사박물관 [청계천과 무학로에 접한 주거지역](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY385&type=A&upperNodeId=CTGRY387&fileSn=300&fileId=H-TRNS-8010-387), [늘우물길 주변 슬레이트 지붕의 공장들](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY385&type=A&upperNodeId=CTGRY387&fileSn=300&fileId=H-TRNS-6273-387), 2009년, 서울생활문화자료조사다. 이번 웹 조회 도구로 원문 페이지를 독립적으로 가져오지는 못했다. 실증의 내용 확인은 MCP가 반환한 기록 본문과 대조한 범위이며 기계 검증이 역사적 사실 전체를 인증한 것은 아니다.

## G. 남은 문제

운영 팀 권한으로 D1 migration0006_evidence_reviews.sql 적용 여부와 DB 연결을 확인하고, 원문·장소·주장·권리를 확인한 기사·영상만 관리 화면에서 승인해야 한다. BigQuery v2는 기존 SQL과 절차로 단계 이행해야 하며 연결 가능과 승인 자료 존재를 구분해야 한다.

새 코드의 Production 반영 후 /health SHA, 센트라스 prepare의 storytelling/map, 기사·영상의 승인 수와 후보 수, 제출 후 usedEvidenceIds를 다시 확인해야 한다. ChatGPT 연결을 갱신한 새 대화에서 갤러리v6·동일 사진·실패 시 원문 링크·외부 지도를 별도 확인해야 한다. 카카오 허용 도메인, 모바일, 기존16개 테스트 실패도 남아 있다.
