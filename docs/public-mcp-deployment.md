# 공개 MCP 전용 Vercel 배포

## GitHub 자동 배포 설정

기존 `seoul-place-docent-mcp` 프로젝트를 `xeonica/seoul-place-docent` 저장소의 `main`에 연결합니다. 프로젝트 Root Directory는 `deploy/public-mcp`, Include source files outside Root Directory는 켜짐, Framework는 Other, Build Command는 `node git-build.mjs`, Install Command는 빈 값, Output Directory는 override 없이 둡니다. Node는 22.x입니다. `deploy/public-mcp/vercel.json`이 루트 홈페이지용 Next.js 설정과 MCP 빌드를 구분합니다.

이 빌드는 Vercel이 체크아웃한 정확한 커밋에서 기존 MCP Build Output API 패키지를 만들고 현재 프로젝트의 `.vercel/output`에 복사합니다. 기존 서버 환경변수와 Production 도메인을 유지합니다. Vercel 계정의 GitHub 연결·저장소 권한은 별도로 필요하며, 코드·메타데이터만으로 OAuth 동의를 대신할 수 없습니다. 연결한 뒤 실제 Git push로 생성된 deployment의 gitSource SHA·READY·/health·MCP 조회를 확인해야 자동 연동 완료입니다.

`bootstrap.mjs`로 공개 Git SHA를 내려받는 방식은 해당 커밋을 배포하는 대체 경로이며 push 자동 연동은 아닙니다.

## 원인과 배포 범위

Sites 홈페이지는 공개지만 Sites가 `/mcp` 앞단에서 OAuth를 요구합니다. 코드의 Origin·Accept 검사를 없애도 Sites가 반환하는 401은 해결되지 않습니다. 별도의 공개 MCP 서버를 배포합니다. 홈페이지·기존 Vercel 웹 설정·역사 데이터·사진·영상·기존 AI API는 그대로 유지합니다.

전용 패키지는 같은 `app/mcp/route.ts`와 자료를 사용합니다. 사이트 관리자/수정 API와 AI 생성 API는 노출하지 않고 `/mcp`, `/health`만 제공합니다. MCP는 OAuth 없이 공개 자료를 반환하며 최종 작성은 사용자의 AI가 합니다. 주소·지도 API와 호스팅 비용은 남습니다.

## 준비된 패키지

```sh
pnpm install --frozen-lockfile
pnpm run build:mcp-public
vercel deploy .mcp-public --prod
```

`.mcp-public`은 별도 Vercel 프로젝트로 배포할 완성 패키지입니다. 자체 `vercel.json`은 framework=null이고 Node 22 Web Standard Function을 사용합니다. 기존 루트 `vercel.json`은 수정하지 않습니다. 함수 코드는 단일 파일로 번들링해 Node 런타임의 tsconfig 경로 매핑 미지원 문제를 피합니다. 빌드는 영상 구간 조회에 필요한 기존 영상 자료 샤드도 함께 묶습니다. 패키지에는 키·토큰을 저장하지 않습니다. GitHub 원본은 버전 관리하며 생성 패키지는 제외합니다.

기존 홈페이지의 Vercel 프로젝트에 덮어쓰지 말고 전용 프로젝트를 만드세요. 배포 후 **안정적인 Production 도메인**을 사용하세요. 임시 Preview URL에 걸린 로그인 보호나 자동화 우회 토큰을 일반 사용자에게 나눠주지 않습니다. 공개 MCP 전용 프로젝트의 Production에 Vercel Authentication/Password Protection이 걸려 있으면 무인증 연결이 실패합니다. 공개 프로젝트의 보호 설정은 계정에서 별도로 설정해야 하며 vercel.json의 public 옵션으로 해결된다고 가정하지 않습니다.

## Git 연결이 없는 Vercel 계정

Vercel 플러그인 연결과 Vercel 계정의 GitHub Login Connection은 별도입니다. Git 연결이 없으면 특정 공개 Git 커밋을 빌드 때 내려받는 소스 배포를 사용할 수 있습니다. `deploy/public-mcp/bootstrap.mjs`를 `build.mjs`로, 아래 package.json과 함께 배포하고 `SOURCE_COMMIT`을 검증된 GitHub 커밋 SHA로 지정합니다. 최신 main을 무조건 내려받지 않고 정확한 SHA를 확인합니다. 이후 갱신은 다시 배포해야 하며 자동 Git 배포가 아닙니다.

```json
{"private":true,"engines":{"node":"22.x"},"scripts":{"build":"node build.mjs"}}
```

`pnpm run build:mcp-public:vercel`은 공식 Build Output API 패키지 `.vercel/output`도 만듭니다. Node HTTP 어댑터와 같은 MCP 번들만 포함합니다. 기존 루트의 Next.js vercel.json은 이 전용 빌드의 배포 설정으로 사용하지 않습니다.

## 비공개 서버 환경변수

- `JUSO_API_KEY`: 실제 주소 검색과 서명 token 생성에 필수. 키는 기존 소유자의 서버 설정에서 전용 프로젝트 환경변수로 전달하며 Git/문서/ChatGPT 입력창에 복사하지 않습니다.
- `KAKAO_REST_API_KEY`: GPS를 주소로 변환하거나 확인한 주소의 기준점 좌표를 구할 때 사용합니다.
- `BUILDING_API_KEY`: 선택한 주소의 국토교통부 건축HUB 건축물대장을 확인할 때 사용합니다.
- `MCP_HISTORY_RADIUS_METERS`: 선택 사항입니다. 주소 기준점 주변 자료의 직선거리 반경이며 기본값은 1,500m입니다.
- `MCP_ALLOWED_ORIGINS`: 필요한 경우 정확한 HTTPS Origin을 쉼표로 지정합니다. 예: `https://chatgpt.com,https://claude.ai,https://gemini.google.com`. Origin 없는 서버 간 요청은 허용됩니다. 미등록·null·와일드카드 Origin은 허용하지 않습니다.
- D1 영구 감사/집계가 필요하면 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN`을 설정합니다. 현재 Sites DB를 읽고 쓰려면 별도의 D1 자격증명이 필요합니다. 없으면 수록 JSON 기록은 조회할 수 있지만 `get_archive_stats`와 영구 감사는 사용할 수 없거나 미설정으로 표시됩니다.
- `OPENAI_API_KEY`, 관리자 키, R2 키는 이 전용 MCP의 핵심 조회에 필요하지 않습니다.

`/health`는 주소 키가 없으면 503, 설정됐으면 200을 반환합니다. 키 값은 응답하지 않습니다. `auth=none`은 앱 코드의 설정이며, 앞단의 Vercel Deployment Protection이 꺼졌다는 증명은 아닙니다.

## 무인증 실제 HTTP 검사

```sh
node scripts/probe-public-mcp.mjs https://ACTUAL-PRODUCTION-HOST/mcp
```

위 호스트는 형식 예시이며 성공 URL이 아닙니다. 프로브는 쿠키·Bearer·보호 우회 키 없이 initialize, tools/list, 최신 프로토콜 헤더, search_place, prepare_place_answer를 실행합니다. 기본값은 공개 장소 주소이며 여러 후보 중 기본 0번을 쓰는 합성 검사입니다. 실제 사용자 흐름에서는 후보 선택을 받아야 합니다.

결과는 `.mcp-test-results/public-probe.json`에 저장됩니다. 주소 token·API 키는 결과 파일에 넣지 않습니다. 이 검사는 **ChatGPT 실제 계정 연결 검사가 아닙니다**. 로그인 HTML·401·403을 성공으로 처리하지 않습니다. `Accept`는 MCP 사양대로 application/json과 text/event-stream을 모두 전송합니다. 무조건적인 CORS 허용이나 Origin 검사 제거를 하지 않습니다.

## ChatGPT 계정에서 최종 검사

ChatGPT 웹 Plugins → + → Add custom MCP server에서 실제 공개 URL을 입력하고 No authentication을 선택합니다. 생성 후 설치하고 새 대화에서 해당 플러그인을 선택합니다. 공개 주소를 사용해 search_place와 prepare_place_answer를 호출하고 서버의 요청 ID와 자료·출처가 반환되는지 확인합니다. 사용자 계정·워크스페이스 정책에 따른 생성/설치 권한도 확인해야 합니다.

HTTP 프로브, 기존 Sites의 인증된 플러그인 호출, 로컬 fixture 검사는 위 실제 계정 검사를 대체하지 않습니다. 실제 URL과 최종 계정 성공 기록은 배포·연결 후에만 보고합니다.

## 기존 홈페이지 안내 연결

공개 배포와 HTTP/계정 검사를 마친 실제 URL을 기존 홈페이지의 서버 환경변수 `MCP_PUBLIC_URL`에 설정하고 최신 소스를 게시합니다. `/api/mcp-connection`은 검증된 HTTPS `/mcp` 주소만 반환하며 자격증명·query token·Sites 주소는 거절합니다. 공개 주소가 없는 Sites 화면은 잘못된 No authentication URL을 복사하게 하지 않고 인증 제한을 알립니다.

## 기존 Sites D1으로 통계 전송

Vercel에 `MCP_AUDIT_URL=https://seoul-place-history.xeonire.chatgpt.site/api/internal/mcp-audit`와 전용 Secret `MCP_AUDIT_TOKEN`을 설정합니다. 같은 Secret을 Sites에 설정하고 수신 API를 배포합니다. 관리자 키와 구분한 통계 쓰기 전용 키입니다. 임의 SQL·자료 내용·사용자 주소·질문은 전송하지 않습니다. 인증, 엄격한 스키마, 크기 제한, 시각 검사를 통과한 호출 메타데이터만 기존 D1에 저장합니다. 실제 저장 응답을 받은 경우에만 `auditPersisted=true`를 반환합니다.

로컬 D1이 있으면 그 D1을 우선합니다. 전송 실패 시에도 자료 조회는 계속되고 `auditPersisted=false`와 구조화 로그가 남습니다. 자동 재전송·과거 로그 소급 저장은 없습니다. `/health`의 auditConfigured는 설정 존재 여부이고, 실제 저장 성공은 MCP 응답 receipt와 관리자 화면의 requestId를 대조해 확인합니다.


### 사진 GPS 주소 변환 연결

공개 MCP에 KAKAO_REST_API_KEY가 없으면 `MCP_MAP_ADDRESS_URL=https://seoul-place-history.xeonire.chatgpt.site/api/map-address`로 기존 사이트의 공개 주소 변환 API를 재사용할 수 있습니다. 이 정확한 HTTPS URL만 허용하고 redirect를 거절합니다. 실제 좌표를 전달하고 서울 범위·반환 좌표를 검사한 뒤 공개 MCP 자체 JUSO 키로 후보를 재조회·서명합니다. 원격 token이나 제공기관 키를 복사하지 않습니다. /health의 photoGpsConfigured는 연결 설정 존재만 뜻하며 실제 호출 성공은 별도로 검사합니다.
