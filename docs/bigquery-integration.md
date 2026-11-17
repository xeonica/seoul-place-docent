# 서울 도슨트 BigQuery 연결 안내

이 기능은 기존 사이트의 JSON·D1·R2 자료를 옮기거나 대체하지 않습니다. BigQuery는 검토용 메타데이터 카탈로그와 분석에 선택적으로 추가됩니다. `BIGQUERY_ENABLED=false`가 기본값이며, 설정이 없거나 BigQuery가 실패하면 MCP는 기존 JSON 자료로 계속 응답합니다.

## 먼저 알아둘 점

- 최초 적재 대상은 `research-data/records.csv`, `places.csv`, `record_place_links.csv` 세 파일뿐입니다. 다른 조사 CSV나 `public/research/` 자료를 자동으로 올리지 않습니다.
- 현재 기준 CSV에는 자료 후보 7건, 장소 후보 3건, 자료-장소 연결 7건이 있습니다. 이들은 검토 후보이며 BigQuery 적재 자체가 사실 검증이나 저작권 허가가 되지 않습니다.
- 현재 후보들의 검토·권리·장소 연결 상태는 모두 검토 전입니다. 따라서 지금 BigQuery에 적재해도 MCP의 검증된 답변 근거로 노출되는 자료는 0건이어야 합니다.
- 기사 전문, 사진 파일, GPS, 사용자의 질문과 AI 답변은 적재하지 않습니다. 원본 CSV의 각 행은 `source_payload` JSON에 보존합니다. 빈 문자열과 시스템의 `NULL`은 이 JSON과 정규화 열에서 구분해 확인할 수 있습니다.
- Google Cloud 프로젝트, Dataset, 인증은 저장소 코드만으로 만들어지지 않습니다. 이 저장소에는 실제 프로젝트 ID나 인증 토큰이 없습니다.

## 구조

| 역할 | 저장소 |
|---|---|
| 역사자료 메타데이터와 후보 분석 | BigQuery `historical_records`, `places`, `record_place_links` |
| 적재 실행 상태와 오류 요약 | BigQuery `ingestion_runs` |
| 운영 아카이브 및 검토 이력 | 기존 Cloudflare D1 |
| 허용된 보관 파일 | 기존 Cloudflare R2 |
| 기존 역사 이야기 | 저장소의 기존 JSON 묶음 |

MCP의 `get_place_history`, `prepare_place_answer`, `validate_place_answer`는 BigQuery를 **읽기 전용으로 선택 조회**합니다. 조회는 구·법정동으로 제한하고 열을 명시하며 결과는 기본 8건 이하입니다. `validate_place_answer`는 같은 장소의 현재 검증 가능 BigQuery 근거를 다시 조회해 근거 ID를 확인합니다. BigQuery 오류 시 기존 JSON 근거를 사용합니다.

서비스 근거로 허용되는 조건은 코드에 제한되어 있습니다.

- `review_status = content_checked`
- `rights_status`가 `KOGL0`, `KOGL1`, `public_domain` 중 하나
- 장소 `location_review_status = verified`
- 관계 `link_review_status = content_checked`
- 관계 유형이 `EXACT_SITE`, `NEARBY`, `DISTRICT_CONTEXT` 중 하나
- 공개 HTTPS 출처 URL

관계 유형 `EXACT_SITE`만으로 건물·필지 동일성을 단정하지 않습니다. `DISTRICT_CONTEXT`와 `NEARBY`는 답변에서도 구 맥락 또는 인근 자료로 구분합니다. 사용 허락이나 출처 근거가 충분하지 않은 자료는 목록에 있어도 통과하지 않습니다.

## 1. Google Cloud 프로젝트와 BigQuery 준비

1. [Google Cloud Console](https://console.cloud.google.com/)에 로그인하고 프로젝트를 선택하거나 새 프로젝트를 만듭니다. 프로젝트 ID와 프로젝트 번호를 따로 기록합니다.
2. 결제 계정이 연결되어 있는지 확인합니다. BigQuery 쿼리는 사용량에 따라 비용이 발생할 수 있습니다.
3. API 및 서비스에서 **BigQuery API**를 사용 설정합니다. Workload Identity Federation을 사용할 계획이면 IAM, Security Token Service 및 Service Account Credentials API도 설정 안내에 따라 활성화합니다.
4. BigQuery Studio에서 Dataset을 만듭니다. 예를 들어 이름은 `seoul_history`, 위치는 운영 환경과 가까운 동일 리전으로 정합니다. Dataset의 위치는 만든 뒤 바꾸기 어렵고 코드의 `BIGQUERY_LOCATION`과 일치해야 합니다.
5. Dataset에 데이터가 들어가기 전에는 프로젝트 ID나 Dataset ID를 추측해 입력하지 않습니다. 실제 콘솔에서 확인한 값을 사용합니다.

이 저장소는 Dataset을 자동 생성하거나 삭제하지 않습니다. 아래 DDL은 미리 만든 Dataset 안에 테이블만 생성합니다.

## 2. 테이블 스키마와 비용 설계

`bigquery/schema.sql`을 열고 `{{project}}`와 `{{dataset}}`을 실제 프로젝트·Dataset 이름으로 바꿔 BigQuery Studio에서 실행합니다. 이 단계는 테이블 구조만 만들며 CSV 데이터를 넣지는 않습니다.

- `historical_records`는 `review_status`, `record_type`, `source_institution`으로 클러스터링합니다.
- `places`는 `district`, `legal_dong`, `location_review_status`로 클러스터링합니다.
- `record_place_links`는 검토 상태와 장소 ID로 클러스터링합니다.
- `ingestion_runs`는 `DATE(started_at)`으로 파티셔닝하고 출처·상태로 클러스터링합니다. 실행 이력 화면에서 최근 날짜를 자주 조회하므로 파티션 필터가 적용됩니다.
- 역사자료는 아직 작고, 장소·시대 검색에서 모든 적재 날짜를 포함해야 하므로 `historical_records`에는 무조건 파티션을 추가하지 않았습니다. 적재 날짜로 자르지 않는 조회에서 오히려 전체 파티션을 읽게 되는 일을 피합니다.
- BigQuery의 기본키·외래키는 일반 SQL DB처럼 중복이나 잘못된 참조를 막아주지 않습니다. 업로드 전에 ID, URL, 관계를 스크립트에서 검증합니다.

MCP 읽기 쿼리는 `SELECT *`를 쓰지 않고 쿼리 파라미터를 사용합니다. 매번 Query Dry-run으로 예상 처리량을 확인하고 `BIGQUERY_MAX_BYTES_BILLED`를 넘으면 실제 조회를 중단합니다. 기본 상한은 쿼리당 100MiB, 기본 응답 제한은 8건, 시간 제한은 8초입니다. Dry-run 예상량과 실제 과금량이 항상 같다는 뜻은 아닙니다.

## 3. 인증 구성

서비스 계정 JSON 개인키를 저장소나 Vercel 환경변수에 넣지 않습니다. BigQuery 읽기와 쓰기에 다른 서비스 계정을 권장합니다.

### 로컬 개발: ADC

1. Google Cloud CLI를 설치합니다.
2. PowerShell에서 다음을 실행하고, 사용할 프로젝트 계정으로 로그인합니다.

   ```powershell
   gcloud auth application-default login
   ```

3. 적재 파이프라인은 Google 공식 BigQuery Python SDK와 Application Default Credentials(ADC)를 사용합니다. 쓰기는 `--apply --confirm APPLY`를 둘 다 지정해야만 시작됩니다.
4. 로컬 MCP가 BigQuery를 조회할 때는 단기 ADC 액세스 토큰을 프로세스에 전달합니다. 토큰은 복사해 채팅이나 GitHub에 올리지 말고, 다음처럼 같은 PowerShell 세션에서만 사용합니다.

   ```powershell
   $env:BIGQUERY_ACCESS_TOKEN = (gcloud auth application-default print-access-token)
   $env:BIGQUERY_ENABLED = "true"
   pnpm dev:vercel
   ```

   로컬 테스트 후 토큰은 만료되며, 새 세션에서 다시 발급해야 합니다. `.env.local`이나 코드에 단기 토큰을 저장하지 마세요.

### GitHub Actions: OIDC와 Workload Identity Federation

Google Cloud에서 GitHub Actions를 신뢰하도록 Workload Identity Pool·Provider를 구성합니다. Provider의 조건은 `xeonica/seoul-place-docent` 저장소와 허용된 기본 브랜치·워크플로만 통과하도록 제한합니다. 가능하면 표시 이름보다 GitHub의 고유 저장소·조직 ID claim을 조건에 사용합니다. 서비스 계정 키 파일은 만들지 않습니다.

GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에 아래 값을 설정합니다.

- `BIGQUERY_WORKLOAD_IDENTITY_PROVIDER`: 프로젝트 번호, pool 및 provider를 포함한 전체 Provider 리소스 이름
- `BIGQUERY_READER_SERVICE_ACCOUNT`: 읽기 전용 계정 이메일
- `BIGQUERY_WRITER_SERVICE_ACCOUNT`: 적재 계정 이메일
- `BIGQUERY_PROJECT_ID`, `BIGQUERY_DATASET_ID`, `BIGQUERY_LOCATION`

두 서비스 계정에는 필요한 프로젝트의 **BigQuery Job User**만 주고, Dataset에는 Reader에 **BigQuery Data Viewer**, Writer에 **BigQuery Data Editor**를 부여합니다. 실제 적재 workflow는 `main`에서만 실행되며 `bigquery-production` GitHub Environment에 보호 승인자를 지정하는 것을 권장합니다. workflow 입력의 `apply` 기본값은 꺼져 있습니다.

공식 안내: [Google Cloud의 GitHub Actions WIF](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines), [GitHub OIDC 인증 Action](https://github.com/google-github-actions/auth).

### Vercel MCP: Vercel OIDC와 Workload Identity Federation

Vercel은 Function 요청에 단기 OIDC 토큰을 `x-vercel-oidc-token` 헤더로 제공합니다. 서버는 이 토큰을 Google STS로 교환하고 서비스 계정을 가장해 BigQuery 읽기 토큰을 받습니다. 장기 키 파일은 저장하지 않습니다.

1. Vercel 프로젝트의 **Settings → Security → Secure backend access with OIDC federation**에서 issuer 모드를 정합니다.
2. Google Cloud에서 그 issuer를 신뢰하는 별도 Workload Identity Pool·Provider를 만듭니다. Vercel의 공식 GCP 설정 안내에 따라 issuer URL, audience, claim mapping과 제한 조건을 설정합니다. 발급자 조건은 해당 Vercel 팀·프로젝트·production 환경만 허용하도록 제한합니다.
3. Vercel 프로젝트의 서버 환경변수(절대 `NEXT_PUBLIC_` 접두사를 붙이지 않음)에 아래를 넣습니다.

   - `BIGQUERY_ENABLED=true`
   - `BIGQUERY_PROJECT_ID`, `BIGQUERY_DATASET_ID`, `BIGQUERY_LOCATION`
   - `BIGQUERY_WIF_PROJECT_NUMBER`: Workload Identity Pool을 소유한 프로젝트 번호
   - `BIGQUERY_WIF_POOL_ID`, `BIGQUERY_WIF_PROVIDER_ID`
   - `BIGQUERY_SERVICE_ACCOUNT_EMAIL`: Dataset 읽기 권한만 가진 서비스 계정
   - `BIGQUERY_MAX_BYTES_BILLED=104857600`
   - `BIGQUERY_QUERY_TIMEOUT_MS=8000`
   - `BIGQUERY_QUERY_MAX_RESULTS=8`

4. Preview/Development에서도 BigQuery를 쓰려는 경우 Production과 분리된 identity 조건과 Dataset을 별도로 정합니다. 설정이 완료될 때까지 `BIGQUERY_ENABLED=false`로 둡니다.

코드는 Vercel의 공식 GCP OIDC 지원에 맞춰 Google STS와 IAM Credentials API를 호출합니다. Vercel·Google Cloud 콘솔의 실제 설정과 인증 성공은 이 저장소만으로 검증할 수 없습니다. 공식 안내: [Vercel OIDC로 Google Cloud 연결](https://vercel.com/docs/oidc/gcp), [Vercel OIDC 개요](https://vercel.com/docs/oidc).

### Cloudflare/Vinext 및 공개 MCP

공통 코드는 Node 전용 BigQuery SDK를 정적으로 가져오지 않고 Web `fetch` 기반 Google REST API를 사용합니다. Cloudflare/Vinext에는 인증 변수를 설정하지 않는 한 기능이 비활성화됩니다. Cloudflare에 BigQuery 기능을 켜려면 별도의 짧은 토큰 수명·인증 경로를 먼저 검증해야 하며, Vercel용 OIDC가 Cloudflare에 자동으로 생기는 것은 아닙니다.

공개 MCP 패키지는 관리자 적재 API나 쓰기 권한을 포함하지 않습니다. 공개 읽기 MCP가 BigQuery를 사용해야 한다면 전용 Vercel 프로젝트의 **읽기 서비스 계정만** 설정합니다. 적재 계정이나 관리자 토큰을 공개 MCP 환경에 넣지 않습니다.

## 4. CSV 검사와 실제 적재

### 로컬에서 검증만

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-bigquery.txt
python scripts/check_research_csvs.py
python scripts/export_history_catalog.py
python -m unittest discover -s tests -p test_bigquery_ingest.py
python scripts/bigquery/ingest.py --reject-report .bigquery-reports/rejected.csv
```

마지막 명령은 BigQuery에 접속하지 않고 후보 CSV의 열·ID·URL 중복·자료 유형·날짜·장소 참조를 검사합니다. 기본 동작은 파이프라인 Dry-run입니다. 실패 보고서는 원자료 내용 대신 파일·행·ID·오류 코드만 기록합니다.

### Query Dry-run

Dataset과 테이블이 이미 있고 ADC 또는 WIF가 준비된 뒤 실행합니다.

```powershell
$env:BIGQUERY_PROJECT_ID = "콘솔에서 확인한 프로젝트 ID"
$env:BIGQUERY_DATASET_ID = "콘솔에서 만든 Dataset ID"
$env:BIGQUERY_LOCATION = "Dataset 위치"
python scripts/bigquery/ingest.py --query-dry-run
```

이 명령은 읽기 쿼리의 유효성과 예상 처리량을 확인할 뿐, 자료 행을 적재하지 않습니다. 이 파이프라인 Dry-run과 BigQuery Query Dry-run은 서로 다른 단계입니다.

### 첫 소량 적재

먼저 GitHub Actions에서 `workflow_dispatch`를 실행하고 `apply=false`, `query_dry_run=false`를 확인합니다. 실제 적재는 Dataset·권한·OIDC 확인 후 보호된 workflow 환경에서만 합니다. 첫 쓰기는 `apply=true`, `limit=1`을 사용합니다. 로컬에서 진행하는 경우 명령은 다음과 같으며, 실제 Google 인증·권한이 있어야 작동합니다.

```powershell
python scripts/bigquery/ingest.py --apply --confirm APPLY --limit 1
```

같은 파일을 다시 적재하면 ID와 콘텐츠 해시로 바뀐 행만 갱신하고 같은 내용은 건너뜁니다. 타깃 데이터 행은 삭제하지 않습니다. 대량 파일은 `BIGQUERY_INGEST_BATCH_SIZE`(기본 5,000, 최대 10,000)행 단위로 분할해 적재하며, 각 완료 구간의 커서는 `ingestion_runs.resume_cursor`에 기록됩니다. 부분 실패 시 같은 CSV와 같은 `--limit`으로 다음처럼 이어서 실행할 수 있습니다.

```powershell
python scripts/bigquery/ingest.py --apply --confirm APPLY --resume <실패한-run-id>
```

재개 명령은 해당 run과 같은 CSV 내용 해시와 제한값인지 검사합니다. 분할 staging 테이블은 1일 뒤 만료되며, 만료 후에는 빠진 구간을 다시 올립니다. 타깃 MERGE는 같은 ID와 콘텐츠 해시 기준으로 반복해도 안전합니다.

전체 적재는 후보 상태와 소량 테스트를 확인한 뒤에만 `--limit` 없이 별도로 실행합니다. `records.csv` 이외의 대형 조사 CSV는 이 명령에 자동 포함되지 않습니다.

## 5. GitHub Actions로 실행

`.github/workflows/bigquery-ingest.yml`은 수동 `workflow_dispatch`만 제공합니다.

- 기본 `apply=false`: 기존 CSV 검사와 로컬 테스트만 수행합니다.
- `query_dry_run=true`: BigQuery 읽기 권한으로 쿼리 비용을 확인합니다.
- `apply=true`: `main` 브랜치와 `bigquery-production` 환경 승인이 필요합니다. 처음에는 기본 `limit=1`을 유지하고, 검토 뒤에만 전체 적재 옵션을 켭니다. `resume_run_id` 입력은 기존 CSV와 제한이 같은 실패 실행을 재개합니다.

주기 실행이나 자동 데이터 수집은 없습니다. `history-catalog.yml`의 검토 엑셀 생성도 그대로 유지합니다.

## 6. Vercel 설정과 MCP 확인

Vercel 프로젝트의 **Settings → Environment Variables**에 위 OIDC/BigQuery 변수를 서버 환경변수로 설정합니다. `BIGQUERY_ENABLED=true`를 켜기 전에 WIF Provider의 조건, Vercel production OIDC, 서비스 계정 Dataset 권한을 확인합니다. 변경된 환경변수는 새 배포에서 적용됩니다.

성공 확인 순서:

1. Vercel Function 로그에서 실패 원인이 없는지 확인합니다. MCP는 BigQuery 오류가 있어도 기존 자료 응답을 유지합니다.
2. 관리자 `/admin/mcp`에서 `BigQuery 조회`, `BigQuery 반환`, `BigQuery 복구`, `BigQuery 평균 ms` 항목을 확인합니다.
3. BigQuery 조회가 실제로 발생한 요청은 동일 요청 ID와 내부 BigQuery 작업 ID·반환 수·시간·캐시·복구 여부가 D1의 `mcp_bigquery_query_log`에 기록됩니다. 주소, 질문, 사진, GPS, 인증정보는 기록하지 않습니다.
4. 초기 CSV는 검토·권리 조건을 통과하지 않으므로 BigQuery 조회가 0건을 반환하는 것이 정상입니다. 이 경우 기존 JSON 자료가 답변 근거로 반환되어야 합니다.
5. `get_archive_stats`는 기존 D1 통계 도구이고, BigQuery 조회 성공의 증거가 아닙니다.

BigQuery 자료 행과 실제 MCP 응답을 확인하려면 Google Cloud에서 Query job, MCP 사용 통계, 요청 ID를 함께 대조합니다. Mock 테스트는 실제 Google Cloud 호출의 증거가 아닙니다.

## 7. 비용·권한·복구

- Google Cloud Billing에서 예산과 이메일 알림을 설정합니다. 알림 예산 자체는 과금 차단 기능이 아닙니다.
- MCP 쿼리는 Dry-run, 최대 처리 바이트, 타임아웃, 결과 건수, 구·법정동 파라미터 제한을 적용합니다. 사용자에게 임의 SQL은 받지 않습니다.
- Vercel과 GitHub의 읽기 계정은 Dataset 조회만, 적재 계정은 보호된 workflow에서만 씁니다. 인증정보를 브라우저 코드나 공개 응답에 넣지 않습니다.
- 비용 제한은 쿼리를 시작하기 전에 초과 여부를 검사하지만 BigQuery의 청구 추정은 실제 처리 바이트와 다를 수 있습니다. Dataset 위치·저장 비용·동시 실행도 따로 관리합니다.
- BigQuery를 멈추려면 Vercel의 `BIGQUERY_ENABLED=false`로 바꾸고 새 배포를 합니다. 이후 MCP는 기존 JSON 자료를 사용합니다. 데이터 보존을 위해 테이블이나 Dataset을 삭제할 필요가 없습니다.

## 오류 코드

| 코드 | 뜻 | 확인할 항목 |
|---|---|---|
| `BQ_DISABLED` | 기능이 꺼짐 | `BIGQUERY_ENABLED` |
| `BQ_CONFIG_MISSING` | 프로젝트·Dataset·위치 또는 숫자 범위 오류 | 콘솔 값과 환경변수 형식 |
| `BQ_AUTH_FAILED` | OIDC/ADC 교환 또는 IAM 실패 | issuer, audience, claim 조건, 서비스 계정 impersonation 권한 |
| `BQ_QUERY_TIMEOUT` | 시간 제한 초과 | 조회 범위, 네트워크, `BIGQUERY_QUERY_TIMEOUT_MS` |
| `BQ_BUDGET_EXCEEDED` | Query Dry-run 예상치가 최대 바이트 초과 | 필터·클러스터·상한 설정 |
| `BQ_QUERY_FAILED` | 나머지 BigQuery API 실패 | 작업 ID와 서버 로그, Dataset 위치 |
| `BQ_INGEST_VALIDATION_FAILED` | CSV 구조·ID·URL·참조 검증 실패 | `.bigquery-reports/rejected.csv` |

## 현재 검증 가능한 범위

코드와 Mock 테스트만으로 실제 Google 프로젝트·Dataset·Dataset 위치·Vercel WIF를 만들거나 확인할 수 없습니다. 실제 데이터 적재는 수행되지 않았습니다. GCP 인증, BigQuery 연결, SELECT, 소량 적재, 배포 뒤 운영 호출은 모두 실제 콘솔 설정과 자격 권한이 준비된 다음에 별도 검증해야 합니다.
