# 서울 장소 도슨트 — 검토용 역사자료 카탈로그

이 폴더는 운영 DB·MCP JSON과 **연결되지 않은** 연구자료 검토용 원본이다.

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
