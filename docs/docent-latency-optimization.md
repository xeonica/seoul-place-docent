# MCP 및 사용자 AI 응답 속도 최적화

측정일: 2026-11-20. 작업 브랜치 `codex/docent-latency-optimization`, [PR #71](https://github.com/xeonica/seoul-place-docent/pull/71). 실제 측정 범위와 미측정 범위를 구분한다. 수치 원본 요약은 [측정 JSON](docent-latency-measurements.json)에 있다.

## A. 180초 지연의 원인: 확인된 것과 미확인인 것

**180초 전체를 재현하거나 원인을 단정하지 못했다.** 서버는 질문 전송 전후의 AI 내부 대기·추론·화면 렌더링을 관측하지 못한다. 이번 작업에서 직접 측정한 것은 운영 HTTP MCP 왕복, 기존 서버 단계 시간, 로컬 HTTP + 실제 정적 자료 + 모의 외부 API다. Codex에서의 MCP 측정을 ChatGPT 화면 측정이라고 부르지 않는다.

기존 코드에 이미 주소 직접 조회, 주소/공식 대장/구별 후보/동네 이야기 캐시, 독립 I/O 병렬화가 있었다. 이를 새 통합 도구로 중복 구현하지 않았다. 주소를 직접 넣는 기존 prepare 경로가 순차 3회 경로보다 실제 운영 측정에서 빨랐다. 기존 직접 응답도 115~156KB로 컸고, 동일 근거·후보·출처가 여러 영역에 반복됐다. 이것이 AI 생성 지연에 얼마나 기여하는지는 별도 미검증이다.

운영 서버에서 관측한 지연 상위 5개는 아래와 같다. 동시 단계의 경과시간이므로 서로 겹치며 합산할 수 없다. 값이 로컬 자산 I/O/CPU/스케줄링을 포함하는 단계도 있어 외부 API 시간이라고 단정하지 않는다.

| 서버 단계 | 표본 | P50 ms | P95 ms |
| --- | ---: | ---: | ---: |
| bigquery_place | 12 | 906 | 4870 |
| bigquery_github | 12 | 560 | 1597 |
| video_metadata: 로컬 목록·자산 | 12 | 46 | 1082 |
| address_search: 캐시 포함 | 10 | 1 | 1078 |
| article_metadata: 로컬 목록·자산 | 12 | 27 | 1070 |

## B. 단계별 관측 범위와 기존 운영 수치

| 단계 | 관측 결과/새 계측 |
| --- | --- |
| 질문 전송→첫 MCP 호출 | 서버 관측 불가. 아래 G의 화면 기록 필요 |
| 연결/초기화 | HTTP initialize 4036ms, tools/list 219ms, 각각 1회 관측. 통제된 콜드 스타트 측정이 아님 |
| search_place | 10회 P50 465ms / P95 2472ms, 응답 중앙 1896바이트 |
| get_place_history | 6회 P50 1362ms / P95 5960ms, 응답 중앙 29891바이트 |
| prepare_place_answer | 16회 P50 1516ms / P95 6366ms. 이 표에는 후보 선택 응답도 포함되므로 아래 유일 주소 흐름 비교와 모집단이 다름 |
| BigQuery / D1 / 자료형별 수집 | 기존 stage ms 유지, 시작/종료 ISO 시각·실패·캐시 상태 추가. 승인 상태는 매 요청 읽음 |
| MCP 전송 | 클라이언트의 HTTP 헤더 도착·본문 완료·바이트 수 측정. 새 Server-Timing 및 X-MCP-Response-Bytes로 직렬화/서버 경과 표시 |
| 감사 저장 대기 | 새 _meta.serverTimings의 executionMs / auditMs / totalMs. 기존 통계 ms는 도구 실행 범위여서 감사·전송 전체 시간과 다름 |
| AI 입력 크기/토큰 | wire/text/structured 바이트를 분리. UTF-8 바이트÷4~÷2의 거친 범위만 제공. 모델이 실제 읽은 토큰 수나 structuredContent 중복 반영 여부는 미관측 |
| AI 생성 시작/완료 | 미측정. 서버 타이머로 추론 시작을 인증하지 않음 |
| validate_place_answer | 기존 근거 연결 예시를 운영에서 재검증: HTTP 762ms, valid=true, mechanical_only. 해설 작성 시간은 제외 |
| 최종 화면/이미지 표시 | 미측정. 본문 완료와 이미지 표시 완료를 구분해야 함 |

초기화·발견 수치는 매 호출마다 더하는 비용이 아니다. 연결을 재사용하는 클라이언트와 매번 초기화하는 클라이언트의 전체 시간을 같게 취급하지 않는다.

## C. 실제 수정 코드

| 파일 | 변경 |
| --- | --- |
| app/mcp/route.ts, lib/brief-docent.ts | 명시적 detailLevel=brief 추가. 기존 standard/full 기본 계약 유지. 공식 주소·선택한 기록 본문·모든 현재 승인 주장·상충을 보존하고 한 번만 직렬화. 불필요한 연구 목록/현장 계획 중복 생성을 생략. validationContext의 새 서명 token으로 주소 재조회 없이 검증 가능 |
| lib/place-evidence.ts | brief에서도 D1 현재 승인·권리·감사를 검사. 승인되지 않은 외부 BigQuery 후보만 deferred로 미루며 자료 없음/조회 성공으로 위장하지 않음. 상세 조회는 기존 full 재사용 |
| lib/bigquery-place.ts | 공개 후보 메타데이터만 60초/64개 인스턴스 캐시. 배포 SHA·서비스 설정·SQL·매개변수를 키로 사용. 오류는 저장하지 않음. STS/IAM 교환은 같은 Request 안에서만 공유하며 요청 간 자격증명 재사용/저장은 하지 않음. v2는 알려진 열 직접 접근, legacy는 선택적 열 호환을 위해 JSON 추출 유지. 전체 r을 응답하지 않고 필요한 3개 메타 필드만 투영. GitHub 검색의 SELECT * 제거 |
| lib/docent-runtime.ts | 기존 캐시 재사용, 초기화 도우미와 단계 시작/끝·캐시 HIT/MISS·not_requested 상태 추가 |
| lib/mcp-audit.ts, lib/mcp-audit-remote.ts | 감사 확인 시간 별도 제공. 원격 통계 저장 1.5초 제한 및 기존 비민감 로그/실제 확인 여부 유지. 확인하지 못한 저장은 auditPersisted=false이며 서버가 저장 성공을 주장하지 않음 |
| lib/runtime/d1-http.ts, lib/place-answer.ts | 승인 SELECT의 HTTP 상한 5초, 선택 통계 쓰기 1.5초. 관리자용 일반 조회/쓰기의 기존25초 유지. 통계 테이블 생성은 DB 인스턴스에서 재사용. 승인 결과를 캐시하는 것이 아님 |
| deploy/public-mcp/node-handler.mjs | 연결 중단을 Request.signal로 전달. BigQuery 취소 가능한 요청에 전파. 버퍼링한 기존 JSON-RPC 계약은 유지 |
| db/schema.ts, drizzle/0007_evidence_audit_lookup.sql, journal | 기존 승인/본문/권리/감사 조건을 바꾸지 않고 archive_audit(action,actor) 인덱스만 추가. 실제 운영 적용은 별도 |
| lib/mcp-protocol.ts, lib/user-ai.ts | 벤치마크한 기존 직접 주소 경로와 brief를 도구 발견 지침·복사 질문에 권장. 모호한 후보는 여전히 선택 요청. 상세 조회가 필요할 때만 추가 도구 호출 |
| scripts/measure-mcp-latency.mjs | 운영 HTTP 왕복·단계·바이트·거친 토큰 범위 기록. token·키·원문 본문은 저장하지 않음 |
| scripts/benchmark-mcp-latency.mjs | 실제 패키지 자료와 모의 API로 5개 장소, 반복·동시5/10 요청·BQ5초 지연·D1실패·이미지실패 측정 |
| tests/docent-latency.test.mjs, tests/reviewed-evidence.test.mjs | 크기 감소, 원본/기록 동일성, 현재 승인 철회, 상충 주장 유지, 인증 교환/후보 캐시·동시성·취소·인덱스 검증 |

추가 라이브러리·운영자 모델 호출은 없다. 선택적 MCP_PUBLIC_METADATA_CACHE=off로 새 공개 후보 캐시를 끌 수 있다. 기존 D1/R2·사진 GPS·HEIC·도구 이름9개를 유지한다. 새로운 get_docent_bundle을 만들지 않았다.

brief는 기본8개 선택 기록 본문을 자르지 않고, 현재 승인 레코드의 claims와 verifiedSegments를 모두 보존한다. 후보 소개만 자료형별2개로 줄이며 생략 수와 full 조회 경로를 제공한다. 사진은 같은 ID/원본/원문/시기/기관/권리·장소 관계를 유지한다. 승인 자료가 아주 많다면 크기 목표보다 주장·상충 보존을 우선하므로 고정 크기 상한을 보장하지 않는다.

## D. 성능 결과

### 실제 기존 Production HTTP 비교

운영 커밋19daae8에서 각5개 검색어를2회씩 측정했다. 을지로281은 2개 후보, 한성대학교는 유일 주소가 아니어서 자동 선택하지 않았다. 나머지 유일 주소3개×2회만 아래 흐름 비교에 포함했다.

| 경로 | 표본 | P50 ms | P95 ms | 중앙 총바이트 |
| --- | ---: | ---: | ---: | ---: |
| search→history→prepare standard | 6 | 3399 | 13313 | 177706 |
| prepare(address) standard | 6 | 1556 | 1982 | 145919 |

서버에서 사용자가 질문을 작성한 시점, AI 대기/추론, 답변 표시를 잰 값이 아니다. 표본이 적으며 최초 조회는 실제 Vercel 콜드 스타트라고 확정할 수 없다. 통합 경로를 새로 만든 것이 아니라 기존 더 적은 호출 경로를 확인했다.

### 로컬 HTTP / 모의 API

실제 패키지 자료, 테스트 서명 주소, 외부 API fixture를 사용했다. 주소5개 각각6회, 정상 응답60회. 같은 프로세스 비교에서 wire 중앙 크기는 standard105603바이트→brief30683바이트, 약71% 감소했다. 선택 기록 ID 불일치0, 프로토콜 실패0이었다. 토큰은 단순 wire 추정으로 약26401~52802→7671~15342 범위이며 실제 AI 입력 토큰으로 확정하지 않는다.

| 같은 프로세스의 요청 조건 | standard P50/P95 ms | brief P50/P95 ms | 범위 |
| --- | ---: | ---: | --- |
| 기본 반복 포함, 각30회 | 32 / 894 | 21 / 44 | 뒤에 실행한 brief는 앞 요청의 캐시 예열 혜택이 있어 이 표만으로 콜드 성능을 주장하지 않음 |
| 동시5 요청 | 153 / 156 | 94 / 95 | 각1개 MCP 호출, AI 작업 아님 |
| 동시10 요청 | 334 / 343 | 195 / 198 | 각1개 MCP 호출, AI 작업 아님 |
| BigQuery 실제5초 제한 모의 장애 | 5035 / 5035 | 30 / 30 | 각1회. P95 SLA가 아닌 개별 사례. brief는 미승인 외부 후보를 deferred로 표시 |
| D1 HTTP 실패 | 35 / 35 | 49 / 49 | 각1회. 승인 없음으로 위장하지 않고 backend_unavailable |

별도 Node 프로세스에서도 실행했다. 최종 간결 경로에서 정상30회 P50약30ms/P95약1409ms였다. 비교용 standard 별도 프로세스는30ms/812ms였다. **최초 요청을 포함한 P95 CPU/자산 성능의 일관된 개선은 입증하지 못했다.** import가 끝난 첫 요청이며 통제된 Vercel 콜드 스타트도 아니다. 최종 보완에서는 전체 JSON 생성→파싱과 미사용 연구 목록 생성을 제거했다. 상세 표본과 구분은 JSON에 보관한다.

공개 메타데이터 캐시의5/10개 동시 조회는 시험에서 물리 쿼리1개로 합쳐졌다. 실제 운영 HIT 비율은 새 코드 배포 후 별도 측정해야 한다. D1 현재 승인 조회는 이 캐시와 독립이다. 기존 분당120회 제한을 넘긴 초기 벤치마크에서는429를 확인했고, 제한을 해제하지 않고94회 이하 배치로 다시 측정했다. 실패한429를 빠른 성공 표본으로 계산하지 않았다.

목표 판정: Production 새 코드의 반복P95≤2초/첫P95≤5초, 첫 유의미한 화면≤2초, 전체 AI10~20초는 아직 미검증이다. 로컬 HTTP 수치로 이 목표 달성을 선언하지 않는다.

## E. 정확성·안정성 및 실행 결과

Node22.21.1에서 다음을 실제 실행했다.

    node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/*.test.mjs
    node --experimental-transform-types --import ./tests/ts-resolver.mjs scripts/benchmark-mcp-latency.mjs outputs/latency-local.json
    node scripts/measure-mcp-latency.mjs --runs 2 --output outputs/latency-before-live.json
    node node_modules/next/dist/bin/next build --webpack
    node node_modules/typescript/bin/tsc --noEmit --incremental false
    node scripts/run-framework.mjs build
    node scripts/build-public-mcp-vercel.mjs
    node --test tests/public-mcp-package.integration.mjs tests/public-mcp-node.integration.mjs

전체 테스트는 **403건 중387 통과·기존16 실패**이며 새 실패 이름은 없다. 새 테스트에서는 공개 메타데이터가 예열된 뒤에도 승인 철회가 다음 조회에 반영되고 기사 claims가 비워지는 것을 확인했다. 기존16건은 조사자료의 건수·해시·이전 비동기 테스트 등이며 기대값을 완화하지 않았다.

공개 MCP 패키지와 실제 HTTP 통합은 **3/3 통과**했다. Next 빌드·타입 검사와 Sites 빌드도 성공했다. 중간에 Sites/Next 공유 생성 타입의 이전 산출물로 타입 오류가 있었으나 Next 재생성 후 검사했다. 운영 DB 이행·실제 v2 BigQuery SQL·ChatGPT 화면은 통과로 표시하지 않는다.

승인·권리·개인 사진GPS·인증 토큰을 공개 후보 캐시에 넣지 않는다. 인증 교환 Promise의 공유는 같은 Request의 수명 안에서만 이루어지며 다른 요청에서는 사용하지 않는다. 공개 후보의 오래된 review/rights 문자열로 승인을 만들지 않고 D1의 현재 본문·권리·감사를 확인한다. 이미지 본체를 근거 준비의 필수 대기로 만들지 않았다. 이미지 프록시502 모의 장애에서도 역사 조회가 완료됐으나 실제 이미지 표시 성공을 인증한 것은 아니다.

## F. 배포 상태

- 작업 시작 시 main과 실제 운영 SHA는 모두19daae8e692bc7ed6b4ea0a267c3136f79c60f6f였다. #69/#70이 포함된 최신 코드에서 작업했다.
- 초기 구현29f6bd6에서 Preview Ready와 /health의 같은 SHA를 확인했다. tools/list는 HTTP200, 도구9개 유지, brief 스키마·직접 호출 안내·Server-Timing·실제 바이트 일치를 확인했다.
- Preview에는 주소 키가 없어 health는 HTTP503/not_configured였다. 이 Preview에서 실제 주소 조회의 새 코드 성능을 확인할 수는 없다.
- 최종 실행 코드 보완 커밋은 f0eed1766c911716bf8450e0a2b8ed76bc638853이다. 뒤의 문서 커밋은 실행 코드를 바꾸지 않는다.
- PR 생성과 Preview 성공을 main/Production 배포 완료로 취급하지 않는다. Production 설정과 D1 마이그레이션은 변경하지 않았다. 운영 팀에 직접 접근 가능한 CLI 인증은 없다.

배포 후 /health SHA와 main을 비교하고 아래를 실행한다.

    node scripts/measure-mcp-latency.mjs --detail brief --flow direct --runs 5 --output outputs/latency-after-live.json

기존 클라이언트는 detailLevel을 생략해도 이전 standard 응답을 받는다. 새 지침을 실제 클라이언트가 채택했는지는 별도 확인 사항이다. Sites 홈페이지의 질문 복사 버튼 업데이트에는 별도 Sites 배포도 필요하다.

## G. ChatGPT 실제 체감 속도

**미검증.** 운영 팀원이 다음 절차로 재현할 수 있다.

1. 같은 AI 서비스·모델, 같은 MCP 연결, 같은 주소·질문, 기록이 없는 새 대화에서 비교한다. 서버 갱신 후 도구 메타데이터를 새로고침해 brief가 노출되는지 확인한다.
2. 비교 지시는 “search_place→get_place_history→prepare standard”와 “prepare_place_answer에 address와 detailLevel=brief”다. 후자에서도 복수 후보의 선택을 생략하지 않는다. 이미 token이 있으면 같은 주소를 재검색하지 않는다.
3. 핵심3~5문단·출처·사용ID로 답변량을 같게 하고 필요한 검증도 같은 조건으로 요청한다. 주소·준비된 근거를 먼저 안내하도록 요청하더라도 실제 표시 여부는 클라이언트에서 확인한다.
4. 화면 녹화/초시계로 T0=전송, T1=첫 도구 표시, T2=근거 도구 완료, T3=첫 해설 글자, T4=해설 본문 완료, T5=이미지 표시 완료를 구분한다. T3를 내부 추론 시작 시각으로 해석하지 않는다.
5. 먼저 센트라스로 각 경로3회, 가능하면 지정5개 주소까지 넓힌다. 전체 답변 시간은 T4−T0, 첫 가시 해설은 T3−T0이다. 도구 requestId를 서버 로그와 대응시키고 이미지만 늦으면 본문 지연과 구분한다.

기록 열: run,address,client,model,detailLevel,T0,T1,T2,T3,T4,T5,requestId,needsChoice,notes. 보이지 않는 시각은 추측하지 않고 비워 둔다. 내부 추론 시작과 실제 모델 입력 토큰은 관측할 수 없다면 미검증으로 남긴다.

MCP JSON-RPC를 임의로 SSE로 바꾸지 않았다. 이번 점진적 조회는 “짧은 근거 응답→필요할 때 상세 조회”라는 호환 방식이다. 중간 진행 메시지를 ChatGPT·Claude·Gemini가 표시한다는 보장은 없다.

## H. 남은 개선과 제약

운영의 주소·D1·BigQuery·이미지 네트워크 상태와 사용자 AI의 도구 선택·추론·출력량·렌더링을 나눠 검증해야 한다. 이전에 확인한 D1 미연결·좌표 키 미설정·박물관 이미지 프록시502가 이 성능 PR로 해결됐다고 보고하지 않는다.

v2 테이블의 기존 파티셔닝·클러스터링과 placeId/PNU 조회를 활용하는 설계를 유지했다. 실제 운영 스키마·쿼리 작업 통계를 보지 못한 상태에서 파티션을 변경하거나, 옛 사료를 날짜로 잘라 내는 조건은 추가하지 않았다. 인덱스0007도 DB 소유자의 기존 절차로 적용 확인이 필요하다.

인스턴스 메모리는 다른 인스턴스와 공유되지 않으며 재시작 때 사라진다. 새 Redis 등은 추가하지 않고 공개 후보60초TTL·버전 키·한정된 크기를 사용한다. 네이티브 D1은 HTTP AbortSignal 대상이 아니어서 강제 취소를 보장할 수 없다. 관리자 일반 쓰기의 기존25초 제한은 유지하며 무한 재시도나 끝없는 백그라운드 작업을 추가하지 않는다.
