# Grok 역사자료 후보 중복 대조 — 2026-11-15

## 범위와 주의사항
- 입력: `research-data/grok/seoul_history_candidates_20261115.csv` (Grok 후보 70행, 19개 열)
- 대조: `research-data/seoul_docent_cumulative_20261115_2100.csv` (기존 누적 50행), `research-data/records.csv` (기존 초기 7행), `research-data/verified-source-links-20261115.md` (선별 링크 3건; 누적 50행에 포함된 링크)
- **원본 70행을 변경·삭제하지 않음.** 중복 의심 자료도 조사 이력으로 보존
- 비교 기준: 원문 URL의 정확 일치(끝의 / 차이 무시), 개별 기록 동일성·리디렉션·본문 중복은 미검증
- **GitHub 보존은 MCP/D1 운영 반영이나 이용 허가를 뜻하지 않음.** 사진·PDF 원본은 포함하지 않음

## URL 기준 결과
| 항목 | 결과 |
| --- | ---: |
| Grok 후보 행 | 70 |
| Grok 고유 URL | 60 |
| Grok 내부 중복 URL 그룹 | 3 |
| Grok 내부 중복 초과 행 수 | 10 |
| 기존 누적 50행과 일치하는 Grok URL | 2 |
| 기존 초기 7행과 일치하는 Grok URL | 0 |
| 기존 선별 링크 3건과 일치하는 Grok URL | 0 |
| 기존 누적 50행에 없는 Grok 고유 URL | 58 |

## 내부 중복 URL
1. `https://archives.seoul.go.kr/photo` — 9행: `SHA-COL-001` ~ `SHA-COL-009`. 서로 다른 주제명에 동일한 포털 URL을 기입했으므로 독립 개별 기록 9건으로 세지 않음
2. `https://archives.seoul.go.kr/item/8097` — 2행: `SHA-ITEM-001`, `SHA-ITEM-018`
3. `https://archives.seoul.go.kr/photo/collection/detail/67` — 2행: `SHA-COL-019`, `SHA-COL-031`

## 기존 누적 50행과 중복
| Grok ID | 기존 ID | URL |
| --- | --- | --- |
| SHA-COL-011 | NEW-YONGSAN-GARRISON-AERIAL-GUIDE | https://archives.seoul.go.kr/contents/garrison |
| SHA-COL-022 | BANPO-02 | https://archives.seoul.go.kr/photo/collection/detail/58 |

## 활용 상태
- 이번 단계는 **서지 후보 보존 및 URL 중복 대조**만 수행
- Grok 파일의 `metadata_checked` 표기는 Grok의 자체 분류이며 별도 원문 검증 완료로 간주하지 않음
- 모든 후보의 원문 이용조건과 장소 연결은 후속 확인 필요
- 운영 D1, MCP 코드, 기존 CSV는 변경하지 않음
- 원기관 ID, URL 정규화, 자료별 실체, 장소 범위 및 저작권 검증 후에만 운영 등록을 검토
