# Vercel Preview의 JUSO 및 D1 연결 설정 안내

현재 확인된 Preview 응답은 HTTP 503 `status=not_configured`, `addressConfigured=false`, `auditConfigured=false`, `auditStorage=none`이다. Vercel CLI에서는 운영 팀의 환경변수 목록을 읽지 못해 개별 환경변수의 존재 여부를 확인할 수 없었다. `/health`로 확인한 것은 주소 API가 비활성이고 D1/감사 어댑터가 준비되지 않았다는 사실이다. 비밀 값은 이 문서에 기록하지 않는다.

## 1. Vercel Preview 환경변수 설정

Vercel에서 팀 `smn0365465-1518`을 선택하고 프로젝트 `seoul-place-docent-mcp`를 연다.

1. **Settings → Environment Variables**로 이동한다.
2. 아래 변수를 각각 추가하고 Environment는 **Preview**로 설정한다. `NEXT_PUBLIC_` 접두어를 붙이지 않는다.

| 변수명 | 용도 | 값 입력 위치 |
|---|---|---|
| `JUSO_API_KEY` | 도로명주소 검색 | 주소정보누리집에서 발급한 서버용 키 |
| `CLOUDFLARE_ACCOUNT_ID` | D1 REST API 계정 식별 | Cloudflare 대시보드 계정 정보 |
| `CLOUDFLARE_D1_DATABASE_ID` | **Preview 전용** D1 DB 식별 | Cloudflare D1에서 별도로 만든 Preview DB |
| `CLOUDFLARE_D1_API_TOKEN` | D1 HTTP API 인증 | 필요한 D1 권한만 가진 토큰 |

현재 프로젝트를 관리하는 계정에서 값 입력 및 저장을 진행한다. 키·토큰을 채팅, GitHub, 문서 또는 브라우저 콘솔에 붙여넣지 않는다. Production 값은 이 절차에서 수정하지 않는다.

## 2. Preview D1과 Production D1 분리 확인

Cloudflare 대시보드에서 Preview에 사용할 데이터베이스를 열고 DB 이름과 database ID를 확인한다. 별도로 Production DB를 열어 ID를 대조한다. 두 ID가 다르고 Preview 대상이 별도 DB임을 소유자가 확인하기 전에는 **Preview 원격 migration도 실행하지 않는다.** 데이터베이스 이름만 다른 것은 분리 증거가 아니다.

Vercel Preview의 `CLOUDFLARE_D1_DATABASE_ID`가 Preview DB ID와 일치하는지 Vercel의 Secret 값 표시/관리 화면에서 확인한다. 값은 화면 밖으로 복사하거나 로그에 출력하지 않는다. 운영 D1 ID와 비교 결과는 문서에 값 대신 `다름 확인`만 남긴다.

## 3. Preview 재배포 후 읽기 전용 확인

환경변수를 저장한 뒤 해당 PR 브랜치의 Preview를 재배포한다. 최신 Preview deployment URL을 Vercel에서 복사한다. 아래 명령의 URL은 새 배포 주소로 바꾼다.

```powershell
$PreviewUrl = "https://<최신-preview-host>"
$Health = Invoke-RestMethod -Method Get -Uri "$PreviewUrl/health"
$Health | Select-Object status,addressConfigured,auditConfigured,auditStorage,mcpPath | Format-List
```

예상 준비 결과는 `status=ready`, `addressConfigured=True`, `auditConfigured=True`, `auditStorage=d1`이다. 값이 다르면 MCP 요청이나 migration 전에 Vercel Function 로그와 binding 설정을 점검한다.

그 후 MCP 요청을 순서대로 확인한다. 먼저 `initialize`, `tools/list`, `get_archive_stats({})`를 호출하고 응답 JSON-RPC ID, HTTP 상태, tool name 및 데이터 수를 기록한다. 그 다음 `search_place`로 주소를 검색한다. 복수 후보면 사용자 확정 전 첫 후보를 자동 선택하지 않는다. 유일한 장소가 식별되어 실제 token을 받은 경우에만 해당 token으로 `get_place_history`, `prepare_place_answer`, `validate_place_answer`를 이어 호출한다. 응답에 토큰·키가 포함되면 기록 전에 마스킹한다.

주소 검색 예시(서버 주소에 따라 `/mcp` 경로를 확인):

```powershell
$Body = @{ jsonrpc = "2.0"; id = 1; method = "tools/call"; params = @{ name = "search_place"; arguments = @{ query = "서울특별시 성동구 마장로42길 16" } } } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri "$PreviewUrl/mcp" -ContentType "application/json" -Headers @{ Accept = "application/json, text/event-stream" } -Body $Body
```

각 요청 ID는 요청마다 고유하게 증가시킨다. `get_archive_stats` 응답에 `INVALID_ARGUMENT`가 나오면 응답과 요청 ID를 저장하고 임의로 다른 인자를 반복 시도하지 않는다.

## 4. 제한사항

- 현재 실증 작업에서는 환경변수 설정, 원격 migration, Production 배포 또는 DB 데이터 변경을 수행하지 않았다.
- Preview D1 분리가 입증되기 전에는 D1 쓰기 테스트를 하지 않는다.
- `health`가 준비 상태여도 사진·영상의 표시 권리 및 근거의 장소 관계는 각각 별도로 확인한다.
- 새로운 배포마다 Preview URL이 달라질 수 있으므로 이전 URL을 당연히 유효하다고 가정하지 않는다.
