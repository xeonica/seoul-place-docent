# 서울 장소 도슨트 — 검토용 역사자료 카탈로그

이 폴더의 CSV는 빌드할 때 MCP의 **검토 후보 검색 인덱스**로 연결된다. 운영 DB의 확정 근거·표시 허용 사진으로 자동 승인되지는 않는다.

- `records.csv`: 사진·지도·문헌·영상·신문기사 후보 및 출처/저작권/검토 상태
- `places.csv`: 장소 후보 및 임시 ID
- `record_place_links.csv`: 자료–장소 관계와 연결 근거
- `scripts/export_history_catalog.py`: ID, URL 중복, 관계 참조 및 필수 필드를 검증한 뒤 XLSX 생성
- `.github/workflows/history-catalog.yml`: 3시간마다 검증·엑셀 산출물 생성 (기본 브랜치에 병합된 뒤 작동)

**중요:** 현재 초기 7건은 검토 후보일 뿐, 원본 확보·저작권 확인·운영 DB 중복 검증이 완료되지 않았다. 뉴스 본문·이미지 원본은 저장하지 않는다. 기존 ID의 `UNVERIFIED`는 확인 전 임시 식별자다.

## 새 후보 추가
기존 CSV의 열을 유지하며 메타데이터만 추가한다. `record_id`와 정규화된 `source_url` 중복을 피하고, 장소 불확실 시 `place_id`를 비우고 `UNCERTAIN`을 사용한다. 확인되지 않은 정보를 추측해 채우지 않는다. 변경은 Pull Request에서 검토한다.

## 자동화 범위
워크플로는 **이미 CSV에 있는 데이터만** 검증하고 엑셀을 생성한다. 신규 웹 수집·CSV 자동 추가·ChatGPT 라이브러리 동기화는 **구현하지 않았다**. 수집기나 쓰기 권한이 별도로 준비되기 전까지 자동 수집이라고 표현하지 않는다. 운영 DB, GitHub 서비스 코드, Notion은 이 워크플로가 수정하지 않는다.

로컬 검증: `python -m pip install openpyxl==3.1.5 && python scripts/export_history_catalog.py`

## MCP 검색 연동 (2026-11-18)

- 빌드의 `pack-video-records.mjs`가 `pack-research-catalog.mjs`를 실행하여 모든 하위 CSV를 읽는다. 외부 요청이나 모델 호출은 없다.
- `get_place_history({"query":"세운상가","limit":6,"offset":0})`로 후보를 검색한다. 선택적으로 `district` 필터를 쓸 수 있다. 기존 주소 `token` 조회는 유지된다.
- `prepare_place_answer`와 주소별 `get_place_history`의 `research`에 법정동·건물명이 메타데이터에 명시된 후보를 별도로 반환한다. 자치구만 같다는 이유로 같은 부지에 연결하지 않는다.
- 같은 원문 URL의 조사행은 묶지만 원본 경로·물리 행 번호·기존 ID·날짜·권리·검토 상태·장소 관계를 보존한다. `places.csv`와 `record_place_links.csv`도 원래의 미검증 판정과 함께 연결한다.
- 후보는 항상 `usableAsVerifiedEvidence:false`이며 사진/임베드 URL을 새로 만들어 표시하지 않는다. AI 활용 금지가 명시된 URL은 설명 발췌를 반환하지 않는다. 다른 CSV에서 권리 표기가 빠져 있어도 제한을 해제하지 않는다.
- `/health`의 `researchCatalog`에 입력행·고유 URL·중복 관측·파일 해시를 공개한다. 이는 기존 사진/영상 데이터셋 건수와 별개다.
- 생성 JSON은 커밋하지 않는다. GitHub CSV 변경을 포함한 커밋으로 다시 빌드·배포해야 운영 검색에 반영된다. GitHub push만으로 Vercel이 자동 배포되는 연결은 별도 설정이 필요하다.
- Markdown 보고서·제외 메모는 검색 근거로 자동 변환하지 않는다. 비정상 CSV와 미지원 스키마는 빌드 실패로 알려 누락을 방지한다.
