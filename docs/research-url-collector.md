# URL-first 국가기록원 수집기 (독립 실행)

기존 MCP/DB/Vercel 코드와 무관한 Python 표준 라이브러리 수집기입니다. 국가기록원 검색 OpenAPI `https://apis.data.go.kr/1741050/openapi/searcharc`를 순회합니다. **공식 기록물 '건'(RITEM)만** CSV에 수록하며 철(RFILE)은 제외합니다. 공식 검색 메타데이터 후보이며 원문 검증·저작권 승인이 아닙니다.

## 실행
1. [국가기록원 OpenAPI](https://www.data.go.kr/data/15158780/openapi.do) 활용신청 후 인증키 준비.
2. 셸에서 `export NATIONAL_ARCHIVES_API_KEY='...'` (키를 저장소에 커밋하지 마세요).
3. `python3 scripts/collect-national-archive-urls.py --max-requests 50`
4. 같은 명령을 재실행하면 `research-data/collector/state.json`의 마지막 페이지부터 이어서 수집합니다.

입력: `research-data/collector/queries.txt` (한 줄에 검색어 하나).
출력: `research-data/collector/records.csv` (고유 공식 개별 URL), `state.json` (쿼리 인덱스·페이지·UTC 일별 API 요청 수·누적 신규/중복/오류).
기본 호출 상한: 실행당 50회, UTC 하루 900회, 요청 사이 1.5초 대기. `--max-requests`, `--daily-request-cap`, `--delay` 조정 가능하나 제공기관 약관·할당량을 준수하세요. 실패하면 커서를 유지하고 다음 실행에서 재시도합니다. 인증 오류는 무한 재시도하지 않습니다.

**중요:** 이 버전은 공식 API 검색결과의 건별 URL을 모으는 1차 수집기입니다. 장소 마스터 203,850개 전체 순회, 서울기록원 개별 item API, 저장소의 기존 CSV 전수 중복 제거, 검색어의 장소 자동 매칭은 아직 구현되지 않았습니다. 중복 기준은 이번 수집기의 동일 출력 폴더 안에서 기관 기록 ID입니다. 기존 연구자료에 없는 '진짜 신규' 수를 주장하면 안 됩니다. 검색어 목록을 변경할 때는 새 출력 폴더를 지정해야 합니다.

예약작업·GitHub Actions 자동 실행은 만들지 않았습니다. 사용자가 직접 실행하는 방식입니다.
