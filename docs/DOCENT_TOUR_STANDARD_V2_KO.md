# 서울 역사 도슨트 7부 표준 해설 시스템 v2.0

## 역할과 호환성

MCP는 공식 주소와 장소·동네 자료, 승인된 주장, 사진·영상 출처를 모아 `tourPlan`이라는 결정적 해설 개요를 반환합니다. 마지막 문장은 연결된 ChatGPT·Claude·Gemini가 작성합니다. 서버는 운영자 AI를 호출하지 않습니다. 기존 MCP 도구 이름, 필수 입력, 기존 `experience`, `narration`, `validate_place_answer` 계약과 MCP Apps 사진 갤러리를 유지합니다. `tourPlan`은 `prepare_place_answer`와 기존 호환 경로인 `generate_place_answer` 응답에 추가되는 선택 필드입니다.

좁은 질문은 기존 질문별 답변을 우선하고, 종합 도슨트 요청에만 계획의 7부 순서를 따릅니다. 기존 6단계 `experience.sequence`는 하위 호환용으로 유지하지만 `tourPlan`이 있을 때 새 응답 지침이 7부를 우선합니다. 간결·표준·상세 응답 모두 같은 계획 빌더를 사용합니다.

## 고정 구성

| 순서 | 고정 ID | 제목 | 배정 기준 |
|---|---|---|---|
| 도입 | — | 장소 소개와 핵심 질문 | 반환된 장소명·주소·행정구역, 현재 공식 정보, 사용 가능한 대표 사진/원문 |
| 1 | `part_1_place` | 먼저 이곳에 서서 주변을 바라봅니다 | 주소·건물 대장·지도와 관찰 안내 |
| 2 | `part_2_name` | 지명에 숨겨진 역사 | 지명·유래 표현이 명시된 자료만 |
| 3 | `part_3_change` | 지역이 변화하기 시작하다 | 사건·산업·사회 변화 자료 |
| 4 | `part_4_site` | 건물과 부지의 역사 | 검토된 직접 건물·필지 자료 및 현재 대장. 직접 과거 근거가 없으면 그 사실을 표시 |
| 5 | `part_5_urban_space` | 주변 도시공간의 변화 | 도시공간·지도·사진 기록. 비교 검증을 받지 않은 자료를 전후 사진으로 묶지 않음 |
| 6 | `part_6_present_change` | 현재 진행 중인 새로운 역사 | 장소 관련 변화 사업의 승인·추진·착공·완공 기록. 관련성과 기준일이 확인되지 않으면 미확인 |
| 7 | `part_7_meaning` | 마지막 정거장 — 장소가 남기는 의미 | 앞서 반환된 근거의 요약과 도입 질문으로 돌아가는 마무리 |

부는 자료가 없어도 제거되지 않습니다. `verificationStatus`는 `supported`, `partial`, `missing`으로 구분하며 `missingEvidenceReason`에 부족한 이유를 적습니다. 4부는 현재 건물 대장이 있어도 건물의 과거 역사가 확인되지 않으면 `partial`로 두고 건립 이전 이력은 미확인으로 표시합니다.

## 데이터와 배정 규칙

`lib/docent-tour-schema.ts`의 Zod `DocentTourV2Schema`가 버전, 기본정보, 정확히 7개 부, 출처, 불확실성, provenance를 검사합니다. `DocentTourSection`은 목적, 작성 지침, 근거·주장·사진·영상·출처 ID, 공간 관계, 검증 상태, 누락 이유와 권장 글자 수를 포함합니다.

`lib/docent-tour-builder.ts`는 `prepare_place_answer`가 이미 읽은 packet에서 자료를 결정적으로 분류합니다. 자료 제목·내용의 명시적 용어와 검토된 `relationType`만 사용하며 URL 정렬과 고정 ID로 같은 입력의 순서를 안정화합니다. 사실 주장에 사용할 수 있는 근거 우선순위는 `exact_building`, `exact_parcel`, 검토된 `historical_site`, `nearby`, `dong_context`, `district_context` 순입니다. 단순 인접성이나 법정동 공유만으로 직접 연관성을 부여하지 않습니다.

승인된 `evidence.records`의 주장만 `claimIds`에 연결합니다. neighborhood 장면은 출처 메타데이터로 구분하고, GitHub·BigQuery 및 미승인 자료는 `candidate_only`입니다. 후보는 사실 주장 ID로 배정하지 않습니다. 사용승인일은 승인일로 표시하고 최초 건립일로 바꾸지 않습니다. 각 계획은 `validateDocentTourV2`로 고정 순서, 7개 부, 출처·claim·미디어 ID의 존재, claim과 근거의 소유 관계, 중복 미디어, 사진 8건·영상 3건 상한을 검사합니다.

## 분량·사진·영상

도입은 150~200자 목표, 각 부는 250~450자 권장이나 자료가 부족하면 채우지 않습니다. 7부는 결론을 위해 앞서 검증된 주장만 다시 참조할 수 있습니다. 사진·영상 ID는 실제 반환 자료에서만 가져오고 부 사이에서 중복 할당하지 않습니다. 사진 검증은 주장 검증과 구분되며, 여기서 계획의 출처 상태를 `source_metadata_only`로 표시해 사진 자산 승인과 역사적 주장 검증을 혼동하지 않습니다. `VERIFIED` 사진 표시·저작자·원문 규칙과 기존 갤러리는 그대로 사용합니다. 영상은 실제 반환 항목만 연결하고 `verifiedSegments`가 없으면 시간 링크를 만들지 않습니다. 미검증 영상은 관련 후보로 표시할 수 있지만 그 내용을 사실 근거로 쓰지 않습니다.

## 검증 범위와 한계

7부 구조의 ID·순서·식별자 참조·자료 상태를 기계적으로 확인합니다. 역사적 의미, 원문이 paraphrase와 일치하는지, 사진 피사체와 촬영 위치가 같은지, 사건 사이 인과관계가 맞는지는 자동 검증됐다고 표시하지 않습니다. `provenance.semanticVerification`은 항상 `not_checked`이며 `operatorAiCalls`는 0입니다.

다른 AI 클라이언트는 종합 해설일 때 `tourPlan.sections`를 순서대로 따라가고, 각 부의 `evidenceIds`·`claimIds`·미디어 ID와 일치하는 자료만 사용해야 합니다. 좁은 질문은 이전 방식대로 답합니다. 빠진 근거는 짧게 미확인이라고 밝히고 추측으로 채우지 않습니다. 자체 웹 검색을 추가하면 MCP 출처와 분리합니다.

## 배포 전 확인

- 기존 도구 이름과 필수 입력, 표준/full 상세 응답 필드가 유지되는가
- `prepare_place_answer`의 7부 ID와 cross-reference 검증이 통과하는가
- 마장로42길 16에서 세림아파트 자체 자료 부족과 마장동 배경 자료가 분리되는가
- 사진 권리·원본·장소 범위 검사와 영상 verified segment 제한이 그대로 적용되는가
- 운영자 LLM 호출 0회와 D1 최신 승인/권리 조회가 유지되는가
- 개발용 MCP와 공개 Vercel MCP 패키지가 모두 새 선택 필드를 반환하는가
- Production 배포 뒤 `/health`, `/mcp` initialize/tools/list와 실제 주소 결과를 확인하는가

API 키·환경변수·DB 스키마 변경은 필요하지 않습니다. 운영 배포는 이 기능 PR의 승인을 받고 운영 담당자가 별도로 수행해야 합니다.
