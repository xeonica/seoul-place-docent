# 주소·건물 통합 및 MCP 근거 구조 (2026-11-18)

## 기준 및 기존 구현

xeonica/seoul-place-docent main 9399112를 확인했다. 건축물대장 개선 Draft PR #49(5479286)가 아직 미병합이므로 이 작업은 그 위에 쌓은 후속 PR이며, 병합 순서는 #49 → 후속 PR이다. 기존 Draft PR을 변경하거나 main에 병합·배포하지 않는다.

기존 주소 API의 searchAddresses/verifyAddress, buildings/closedBuildings/placeRegisterRecords, getFullDocentStory/getDocentStory, searchResearchRecords/placeResearchCandidates, preparePlaceAnswer/guidePhotos, getDocentVideoCandidates, validateAnswer를 재사용한다. D1/R2는 기존 어댑터 및 자료 경로를 유지한다. 현재 main에는 운영 BigQuery 검색 모듈이 확인되지 않아 새로 만들지 않았다. 별도 ai-summary/docent-narration 기능에 운영자 모델 호출 코드가 있으나 MCP 도구의 해설 경로에는 추가 호출하지 않았다.

## 도구 및 데이터

- resolve_place_entity: query 또는 서명된 token 하나. 공식 주소 API의 유일한 전체 결과만 해소한다. 첫 페이지 하나라도 total이 여러 개면 선택을 유지한다. 이름을 임의로 별칭 등록하거나 주소를 하드코딩하지 않는다.
- placeId는 공식 건물관리번호, 없으면 법정동코드·산여부·지번 PNU로 생성한다. 동일 필지의 다른 건물관리번호는 다른 ID다. 관리번호·대장 PK·K-apt 코드를 섞지 않는다. 행정동·좌표·K-apt 코드는 확인되지 않으면 null이다.
- get_building_profile: token에 해당하는 현재 건축물과 총괄표제부, 폐쇄대장 조회 상태와 필지 후보를 반환한다. 대장이 한 개로 검증될 때만 건축물대장 PK를 장소에 연결한다.
- prepare_place_answer: 기존 루트 필드를 유지하면서 place, facts, history, media, sources, limitations, verification, retrievalStatus를 추가한다. 현재 대장/폐쇄대장 및 영상 조회는 독립적으로 진행하며 부분 실패를 표시한다.
- content.text JSON과 structuredContent를 함께 제공한다. TypeScript 반환 타입과 PLACE_OUTPUT_SCHEMA를 제공하며, 주소 선택이 필요한 기존 needsChoice 응답도 스키마에서 허용한다.
- history의 중복 본문은 recordRef JSON 포인터로 기존 neighborhood/research 레코드를 참조한다. 후보의 CSV 파일/행 번호/권리/검토 상태는 기존 research에 보존한다.
- 사진은 evidenceIds와 기존 guidePhotos의 이용 가능한 미리보기만 연결한다. 영상은 동네/자치구 후보, 원문 링크와 verifiedSegments를 유지한다. 지명 후보를 좌표 확인된 인근 장소로 승격하지 않는다. 영상에 역사 근거 ID가 확인되지 않으면 evidenceIds는 비어 있다.

## 검증과 제한

기존 숫자·ID 검사를 유지하고 선택적 scope 및 media_ids를 추가했다. 동네 자료를 building/complex/parcel/nearby 근거로 인용하거나 구 자료를 동네로 좁히는 문단, 건물 직접 장소 단정, 미등록 미디어, 출처 없는 인과관계 표현은 보류한다. 인과관계는 보수적 문구 검사이며 의미적 사실 검증이 아니다. 표현이 달라진 참인 문장도 거절될 수 있다. 검토 전 조사 ID는 기존 근거 허용 목록에 없으므로 확정 인용할 수 없다. buildingClaims는 #49의 정확한 필드 검증을 유지한다.

K-apt와 행정동·법정동 코드 통합, 정확한 좌표에 따른 거리 검색, 검증된 건물 직접 역사 자동 승격은 구현하지 않았다. 새 외부 검색 서비스나 새 API 키는 도입하지 않았다. 기존 JUSO/건축물대장/폐쇄대장 키의 유효성이 필요하다. 원문 독립 검증 없는 자료로 공백을 메우지 않는다. 장소 캐시는 인증키 변경·오래된 공공정보의 영향을 피하기 위해 추가하지 않았고 기존 영상 샤드 캐시를 유지한다.

## 실제 검사

- 세림아파트 도로명/지번/지역 포함 이름을 **동일한 모의 공식 주소 응답**으로 검사하면 같은 placeId다. 단독 이름에 두 공식 후보를 반환하는 검사는 ambiguous이며 자동 선택하지 않는다. 실제 동일 장소 확인을 의미하지 않는다.
- 네 입력을 기존 로컬 키로 실조회: 마장로42길 16, 마장동 784, 마장동 세림아파트, 세림아파트 모두 JUSO_E0014. 사용 가능한 로컬 BUILDING_API_KEY가 없어 건축물대장 수치 실조회 성공은 미검증이다. 운영 Vercel의 키 설정 상태를 이 결과로 추정하지 않는다.
- 관련 도구·장소·검증·조사자료 검사 35개 통과.
- 최종 전체 검사 323개: 305개 통과, 18개 실패. 직전 main 비교 실행에서 재현한 동일 18개 기존 자료실/원본 해시/자료 건수/권한 기대값 실패다. 신규 도구 추가에 따른 2개 도구 개수 기대값은 11개로 갱신했다. 기존 테스트를 삭제·비활성화하지 않았다.
- TypeScript 검사 통과, Next.js webpack 빌드 통과. 첫 빌드의 로컬 EPERM 오류는 정상 파일쓰기 권한으로 재실행해 해결했다. 실제 브라우저 및 모바일 검사는 수행하지 않았다.

## 성능

scripts/measure-place-evidence.mjs는 외부 API 없는 동일 모의 주소, 건물/폐쇄대장 키 없음 조건에서 MCP POST부터 JSON 수신까지 6회 측정한다. 사용자 AI 완료 시간·네트워크·공공 API 지연은 측정하지 않는다.

이전 #49: 첫 호출 75.73ms, 이후 평균 23.28ms, 응답 98,009 bytes. 통합 후 최종 측정: 첫 호출 93.95ms, 이후 평균 20.80ms, 응답 228,192 bytes. 작업 중 CPU 경쟁이 있던 다른 측정은 첫 호출 273.53ms/이후 평균 46.31ms로 변동이 컸다. 이 결과만으로 속도 향상을 주장하지 않는다. structuredContent와 호환 text를 함께 보내므로 응답 크기는 증가한다. 수치는 로컬 단일 샘플이며 2초/10초 서비스 목표 달성을 보장하지 않는다.

실조회 재현: 환경 설정 후 Node 22에서 `node --experimental-transform-types --import ./tests/ts-resolver.mjs scripts/check-place-entity.mjs`. 비밀키·주소 token은 출력하지 않는다.
