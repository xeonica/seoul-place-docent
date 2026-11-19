# 장소별 기사·영상·문헌 근거 파이프라인 (2026-11-20)

## A. 수정 전 확인한 구조와 원인

기준 main: `6436b5621a1a4790f860ff174580bb3913a27fe5`.
선행 사진 검증 브랜치: `codex/verified-history-images`, `75ea4760cb77393c43c6b2a4a402e12e067eef55`, Draft PR #63.
이번 브랜치는 사진 검증 기능을 보존하기 위해 #63 위에 쌓는다. main 자동 병합·운영 배포·운영 DB 변경은 하지 않는다.

1. MCP는 `docent_serving.place_records`, `docent_serving.github_research_candidates`, `docent_raw.hansung-archive`를 조회한다. 기존 WIF(런타임 Vercel OIDC → STS → 서비스 계정 → BigQuery)를 유지한다. 후보는 원래부터 확정 근거가 아니었다.
2. place_records 검색은 공백을 제거한 도로명주소만 비교했다. 미적재·주소 표현 차이·연결 누락·권한 오류·승인 부재가 서로 다른 원인인데 `ready`와 빈 records만으로 구분하기 어려웠다.
3. 기존 GitHub 검색은 동네/건물명을 찾지만, 동일 건물이나 필지의 증명이 아니었다. 한성대 공식 목록은 캠퍼스 주소/학교 검색에 별도 제한돼 있었다.
4. documentContext의 sources/claims는 초안의 참조 ID를 따라갔지만, 별도 25,535개 기사 인덱스가 최종 근거 체계와 연결되지 않았다. 본문 검토(content_checked)는 개별 장소 동일성이나 인용·AI 처리 허락이 아니었다.
5. 영상은 지역 관계 순위로 후보를 고른 후 3개를 잘랐고, 상세 자산을 순차로 읽었다. verifiedSegments 없는 영상은 내용 승인과 사용 수준을 별도로 표시할 경로가 없었다.
6. 기존 D1의 본문 검토·출처 버전·감사 이력을 재사용한다. 새로운 권한 체계를 별도로 만들지 않는다. 관리자는 기존 x-archive-admin 인증을 사용한다. Vercel은 Sites 신원 헤더를 신뢰하지 않는다.
7. 기존 prepare의 동네 기록과 검증기는 그대로 유지한다. 새로운 기사·영상 주장은 별도 활성 승인과 권리 심사를 거친 경우에만 추가한다. 운영자 AI는 호출하지 않는다.

## B. 구현 결과

### 장소·BigQuery

- `lib/evidence-place.ts`: 건물관리번호와 PNU 키, 도로명/지번 표기 정규화, 동/구 배경 범위. PNU는 서울 법정동 코드·산 여부·유효한 본번/부번이 있을 때만 만든다. 주소에 없는 행정동이나 좌표를 만들지 않는다.
- `lib/bigquery-place.ts`: 건물관리번호, PNU, 도로명·지번, 건물명, 동, 구 배경 후보와 감사된 별칭 검색. 선택적 좌표 입력은 SAFE.ST_GEOGPOINT/ST_DWITHIN과 최대 2km 반경으로 검색한다. 현재 주소 token에는 좌표가 없으므로 일반 prepare 요청에서 좌표를 추정해 넣지 않는다. 문자열/거리 일치로 승인하지 않는다.
- 기존 뷰는 기본값으로 유지한다. `BIGQUERY_PLACE_SERVING_VERSION=v2`인 경우에만 새 `docent_serving.place_evidence_candidates_v2`를 조회한다.
- 쿼리는 파라미터, 페이지 크기/offset 상한, 기존 5초 제한·1GB maximumBytesBilled를 유지한다. LIMIT만으로 스캔 비용이 제한된다고 가정하지 않는다.
- BigQuery의 승인 문자열은 권한 증명이 아니다. 현재 D1 승인/본문/권리/감사 이력이 최종 판단 기준이다. BQ 실패 시 D1과 정적 자료를 계속 조회한다.

### 자료·승인·검증

- `lib/reviewed-evidence.ts`, `lib/place-evidence.ts`: stable evidenceId/claimId, 원본 recordId, 출처·기관·두 날짜, 장소 관계, 권리, 영상 사용 수준을 공통 구조로 반환한다. 지역 배경을 건물 역사로 승격하지 않는다.
- `drizzle/0006_evidence_reviews.sql`, `db/schema.ts`, journal: 기존 source/passage에 연결하는 추가 승인 원장. candidate/pending_review/approved/rejected/revoked를 새 리비전으로 보존한다. 원본 본문·기존 승인 기록은 삭제하지 않는다.
- 승인에는 현재 원문 본문 검토, 등록 출처와 원본 ID 일치, 장소 연결 근거, 역사적 주장 확인, 인용 허락과 AI 처리 허락의 개별 확인이 필요하다. recordId는 D1 source.id 또는 source.provider_id와 일치해야 한다. CSV의 원본 ID를 사용하려면 제공기관 자료 ID에 그 ID를 등록한다.
- 출처/본문 스냅샷, 현재 본문 검토 ID, 승인 리비전, 승인 상태·검토자와 일치하는 감사 기록을 매 요청 확인한다. 승인 원장은 캐싱하지 않는다. 철회/재검토/출처·권리 변경은 다음 조회에서 주장 제공을 중단한다.
- 짧은 본문만 제공한다(재서술 최대 1,200자, 인용·전사 최대 300자). 임의 요약 생성이나 기사 전체 본문 배포는 하지 않는다. 전승·추정 분류도 보존한다.
- 검증 영상에 구간이 없으면 place_verified/full_video_link와 실제 확인한 주장만 반환한다. 구간은 시각 형식, 시작/끝, 확인 시각과 동일 원문 URL을 검사한다. 미검토 카탈로그는 metadata_only/candidate_link_only로 유지한다. 기존 verifiedSegments 필드는 유지한다.
- `validate_place_answer.evidenceClaims`: 근거/주장 ID·현재 승인·원문 ID·날짜 구분·관계 범위·검증 구간을 다시 확인한다. 원문과 다른 재서술은 검토 대상으로 보류한다. 의미적 검증은 `not_checked`이며 서버가 자동 사실 검증을 완료했다고 표시하지 않는다. 기존 answer 입력도 계속 지원한다.

### 검색·관리·호환성

- 기사 25,535개를 자치구별 작은 메타데이터 자산으로 빌드한다. 제목/기관/발행일/장소/원본 행을 검색하며 본문은 후보 응답에 포함하지 않는다. 정적 인덱스만 최대 3개 구를 메모리에 보관한다. 승인 상태는 저장하지 않는다.
- 영상은 내부 120개 후보 풀과 반환 크기(기본 3, 최대 12)를 분리하고 질문/건물명으로 정렬한다. 상세 파일은 병렬 읽기하며 pagination을 제공한다.
- sources/links/claims/timeline 원본 ID를 v2 적재에 보존한다. 공통 문헌 후보에도 source/claim/timeline 참조를 유지한다. 같은 원문의 여러 조사행과 주장은 URL만으로 합치지 않는다.
- prepare/generate 응답의 place/neighborhood/visuals/videos 및 갤러리 structuredContent.photos를 유지하고 evidence를 추가한다. photo 후보를 공통 구조에 넣어도 이미지 표시 권한은 별도이며, 선행 PR #63의 사진 차단 정책을 유지한다. 도구 개수는 늘리지 않는다.
- `app/admin/evidence/page.tsx`, `/api/admin/evidence`: 기존 관리자 키로 장소별 후보/승인/권리/미검토 구간/기사 날짜 누락을 확인하고 개별 본문 검토 이력을 저장·반려·철회한다. 자료실에서 링크한다. 키는 브라우저 메모리에만 두며 API는 private,no-store다. 원문 접근성은 실제 확인 전까지 not_checked다.
- `lib/mcp-audit.ts`: 기존 requestId에 자료 유형별 조회 개수·사유를 추가로 연결한다. 질문/주소/token/인증정보를 로그에 넣지 않는다. 개수는 응답 표본 범위이며 데이터베이스 전수 집계가 아니다.
- 기사 자산 읽기는 기존 video-records-asset의 Node/Cloudflare 어댑터를 확장한다. Sites ASSETS, Next 파일 추적, 별도 공개 MCP의 두 Vercel 패키징 방식을 유지한다. 추가 라이브러리는 없다.

### v2 테이블과 적재

새 테이블: docent_ingest.evidence_snapshots_v2, docent_serving.places_v2, place_alias_reviews_v2, record_place_reviews_v2.
새 뷰: docent_serving.place_evidence_candidates_v2.

`export-evidence-v2.mjs` → 격리된 실행별 staging → MERGE append-only snapshots → candidate 장소/관계 → v2 후보 뷰 → 런타임 D1 승인 확인의 흐름이다. source_commit/import_row_id로 재실행을 중복 제거하고 과거 버전은 유지한다. 별칭이나 CSV 검토 문자열을 자동 승인하지 않는다. 조사 파일에서 지워진 자료의 자동 철회는 구현하지 않았으므로 관리자에게 별도 철회가 필요하다.

## C. 실제 실행 결과

- 추가 테스트: **26/26 통과**. 승인/철회/권리/원본 ID 불일치/본문 변경/동네와 다른 건물/날짜 구분/잘못된 영상 구간/구간 없는 영상/동시 수정/감사 실패 롤백/비관리자/실제 MCP 라우트 호환성을 검사했다.
- 전체 테스트: 최종 로그 기준 **365개, 348 통과, 17 실패**. 선행 브랜치의 339개 중 17개 실패와 테스트명이 동일하며 새 실패는 없다. 기존 데이터 수·해시 및 API 테스트 관련 실패를 숨기거나 삭제하지 않았다. 전체 테스트 통과 조건은 아직 충족하지 못한다.
- 공개 MCP 배포 패키지·실제 로컬 Node HTTP 어댑터: **3/3 통과**. 사진 프록시 회귀 테스트의 임의 미등록 이미지 fixture를 실제 등록 자산으로 바꿔, 사진 출처 차단 정책을 우회하지 않고 전송을 검사한다.
- 타입 검사, Next/Vercel 빌드, Sites/Cloudflare 빌드, 별도 공개 MCP Vercel Build Output 패키지 빌드를 실행했다. 최종 실행 결과는 아래 명령 및 outputs 로그로 확인한다.
- 실제 로컬 적재 파일 생성: **31,659행**, 그중 기사 **25,535행**. 원본 CSV/문헌 관계와 commit/file/line/import ID를 유지한다. 이 수는 BigQuery에 적재 완료했다는 뜻이 아니다.
- 성내동 448-11/윤선생빌딩, 마장로42길 16, 한성대학교: 제공한 주소를 이용한 **픽스처 통합 테스트**다. 필지번호 일부는 테스트용이며 실제 JUSO 조회/건물 식별 결과가 아니다. 운영 데이터에 건물 직접 자료가 존재한다고 보고하지 않는다.
- BigQuery WIF/쿼리는 HTTP fixture로 성공·0건·실패·파라미터·시간/요금 상한을 검사했다. 실제 운영 OIDC 및 계정으로 SQL dry-run/조회/적재는 수행하지 않았다. 뷰 실연결, 자료 승인 내용과 권리, 외부 원문 접근성, 실제 휴대폰/브라우저 관리 화면, 운영 TTFB/전체 응답시간은 **미검증**이다.

응답 구조(승인 테스트에서 실제 확인한 값의 형태, 운영 데이터가 아님):

```json
{"evidence":{"status":"approved_records_available","records":[{"recordId":"ARTICLE-ORIGINAL-ID","mediaType":"article","sourceUrl":"https://example.org/original","eventDate":"1978","publishedAt":"1979-02-03","relationType":"exact_building","rightsStatus":"citation_and_ai_permitted","usableAsVerifiedEvidence":true,"claims":[{"text":"1978년에 시장이 이전했다는 기사 설명을 확인했다.","sourceLocator":"기사 7면 2문단","classification":"factual","verified":true}]}],"semanticVerification":"not_checked"}}
```

실제 응답에는 해시 기반 evidenceId, 본문 claimId, 검토 리비전, 후보와 진단 필드가 추가된다. 위 예시는 관련 필드를 발췌한 것으로 운영 사실을 뜻하지 않는다.

## D. 배포 절차 (이번 작업에서는 실행하지 않음)

1. 선행 사진 PR #63과 이 Draft PR을 순서대로 검토한다. 승인 전 main 병합/배포는 하지 않는다.
2. 기존 D1을 백업하고 추가 마이그레이션 `drizzle/0006_evidence_reviews.sql`을 기존 마이그레이션 절차로 적용한다. 새 서버를 먼저 배포해도 미적용 DB는 backend_unavailable로 안전하게 fallback하나, 승인 기능은 작동하지 않는다.
3. 기존 프로젝트/dataset/location을 확인한 뒤 `scripts/bigquery/evidence-v2.sql`을 실행한다. 기존 테이블/뷰를 덮어쓰지 않는다. 새 v2 뷰도 IF NOT EXISTS이므로 스키마를 바꾸려면 다음 버전 마이그레이션을 별도로 작성한다.
4. main 병합 이후 `Import versioned evidence candidates v2` workflow를 수동 실행한다. WIF writer 권한이 필요하며 기존 pinned auth와 service account 설정을 재사용한다. 실행별 staging은 24시간 후 만료되고 snapshots는 남는다. workflow는 export/load/merge/link 순으로 수행한다.
5. 수동 진행 시: `node scripts/export-evidence-v2.mjs <output.ndjson>` → 기존 github_research.schema.json으로 새 실행 테이블 load → merge-evidence-v2.sql의 __RUN_TABLE__을 안전한 실행 테이블 이름으로 치환 → 실행 → link-evidence-v2.sql 실행. 기존 staging/serving은 replace하지 않는다.
6. 기존 Vercel 서버 변수에 GCP_PROJECT_ID, GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL, BIGQUERY_LOCATION을 설정한다. 서비스 계정 개인키는 추가하지 않는다. 검증 후에만 BIGQUERY_PLACE_SERVING_VERSION=v2로 전환한다. 누락/빈 값은 legacy 조회다. D1/R2/ARCHIVE_ADMIN_TOKEN은 기존 서버 설정을 사용한다. `.env.vercel.example` 참고.
7. 홈페이지는 기존 빌드 방식으로, 별도 공개 MCP는 `npm run build:mcp-public:vercel` 결과를 기존 배포 방식으로 각각 재배포한다. 로컬 생성만 했으며 이번 작업에서 Vercel 배포 명령을 실행하지 않았다.
8. 운영 주소 `https://seoul-place-history.xeonire.chatgpt.site/`의 `/admin/evidence`와 주소 token을 사용해 진단한다. 공개 MCP는 실제 설정된 MCP_PUBLIC_URL의 `/mcp`에 tools/list, search_place, prepare_place_answer, validate_place_answer를 호출한다. 로컬 설정에 없는 별도 Vercel 주소를 임의로 만들지 않는다.
9. 기존 자료실에서 출처 providerId, 짧은 본문과 현재 원문 대조를 기록한 뒤 관리자 화면에서 장소 연결 및 인용/AI 권리를 승인한다. 승인 전후·철회 후 결과, 기사/영상 인용, 세 주소 및 사진 차단을 다시 확인한다. 원문은 자동 수집/승인하지 않는다.

## 재현 명령

Node 22 사용. Windows 로컬 확인에서는 C:/양진이/node-v22.21.1-win-x64/node.exe를 사용했다.

```sh
node scripts/pack-video-records.mjs
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/reviewed-evidence.test.mjs tests/bigquery-evidence-v2.test.mjs tests/evidence-mcp.integration.test.mjs
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
node scripts/run-framework.mjs build
node scripts/build-public-mcp-vercel.mjs
node --test tests/public-mcp-package.integration.mjs tests/public-mcp-node.integration.mjs
```

로컬 HTTP 테스트는 샌드박스의 loopback 제한으로 fetch failed가 발생해 실행 권한이 있는 환경에서 재확인했다. 이후 3개 모두 통과했다. Sites와 Next를 동시에 빌드했을 때 .next/types를 서로 덮어써 타입 생성 오류가 한 번 발생했다. 이후 Sites 완료 후 Next를 순차 빌드해 성공했고 독립 타입 검사도 통과했다. 두 프레임워크 빌드는 같은 체크아웃에서 병렬 실행하지 않는다.

빌드의 기존 경고(inlineDynamicImports deprecation, 플러그인 소요시간, Sites route classification)는 실패로 숨기지 않으며 이번 기능의 운영 검증을 대신하지 않는다.

GoogleSQL 문법 참고: [파라미터 쿼리](https://cloud.google.com/bigquery/docs/parameterized-queries), [MERGE](https://cloud.google.com/bigquery/docs/reference/standard-sql/dml-syntax#merge_statement). 운영 계정 dry-run을 거치기 전 SQL 정상 실행으로 단정하지 않는다.
