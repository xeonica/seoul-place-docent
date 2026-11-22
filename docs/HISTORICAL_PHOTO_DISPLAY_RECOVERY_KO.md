# 서울역사박물관 사진 표시 복구

확인일: 2026-11-22 (KST)

## 변경 내용

- `prepare_place_answer` 도구 목록에 기록 사진 MCP Apps 갤러리 리소스를 연결했습니다. 이전에는 갤러리 리소스가 `resources/list`에만 있고 도구의 출력 템플릿 메타데이터가 빠져 있었습니다.
- 응답에 `photoPreviews`를 별도 표시 필드로 추가하고, 호환성을 위해 기존 `photos`도 유지합니다. 두 필드는 같은 기록 ID, 이미지 URL, 원문 URL, 캡션을 사용합니다.
- 사진은 `illustration_only`로 표시하며, 7부 `photoAssets`의 검토·승인 상태를 바꾸지 않습니다. 승인되지 않은 사진을 `VERIFIED`로 올리지 않습니다.
- 성동구 마장동 검색 시 아래 네 공식 기록을 우선 포함합니다. 사진 범위를 각 캡션에 표시하여 세림아파트 자체 사진과 혼동하지 않도록 했습니다.
- 조사 색인에서 표시 가능 여부와 썸네일 표시 가능 여부가 명시되지 않았거나 불허·미확인인 사진은 미리보기 후보에서 제외합니다. 기존 원문 링크는 보존합니다.
- 미리보기 실패 시 갤러리는 같은 기록의 직접 이미지 URL을 한 번 시도하고, 계속 실패하면 같은 기록의 원문 링크를 제공합니다.

## 네 자료의 원문·권리·이미지 대조

| 자료 ID | 제목 및 장소 범위 | 서울역사박물관 원문 | 이미지 파일 ID | 이용 조건 |
|---|---|---|---|---|
| `seoul-museum-1178` | 숭인동 우시장의 모습 (1956), 종로구 옛 우시장 — 마장동 이전 전 장소 | [원문](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY372&type=A&upperNodeId=CTGRY373&fileSn=300&fileId=H-TRNS-54699-373) | `H-TRNS-54699-373` | 공공누리 제1유형(출처표시) |
| `seoul-museum-1183` | 마장동 우시장 풍경 (1962), 마장동 동네 기록 | [원문](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY378&type=A&upperNodeId=CTGRY379&fileSn=300&fileId=H-TRNS-49281-379) | `H-TRNS-49281-379` | 공공누리 제1유형(출처표시) |
| `SEOUL-GU-016-DONG-006-B001-P001` | 마장동 가축시장 풍경 (1962-12-10), 마장동 동네 기록 | [원문](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY372&type=A&upperNodeId=CTGRY373&fileSn=300&fileId=H-TRNS-54700-373) | `H-TRNS-54700-373` | 공공누리 제1유형(출처표시) |
| `seoul-museum-1188` | 서울의 축산물 공급 창구 (1970년대 후반), 서울시 공급망 배경 | [원문](https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?ctgryId=CTGRY372&type=A&upperNodeId=CTGRY373&fileSn=300&fileId=H-TRNS-80335-373) | `H-TRNS-80335-373` | 공공누리 제1유형(출처표시) |

네 원문 페이지를 실제 HTTP GET으로 열어 제목과 공공누리 제1유형 문구를 확인했습니다(모두 HTTP 200). 네 이미지 URL은 같은 원문 페이지의 `fileId`와 `fileSn=300`에서 구성합니다. 네 사진은 모두 서울역사박물관·서울생활문화자료조사 출처를 표기합니다. 첫 사진은 마장동 사진이 아니라 이전 전 숭인동 사진이고, 마지막은 마장동만의 장면이 아니라 서울시 공급망 배경입니다.

## 실제 이미지 HTTP 확인

운영 주소 `https://seoul-place-docent-mcp.vercel.app/img`에서 동일 이미지 URL로 GET 요청했습니다.

| 자료 ID | `/img` 상태 | Content-Type / 크기 | 직접 이미지 원문 | 표시 처리 |
|---|---:|---|---|---|
| `seoul-museum-1178` | 502 | 프록시가 이미지 본문을 반환하지 않음 | HTTP 200, `image/jpeg`, 57,732 bytes | 갤러리의 같은 기록 직접 URL fallback |
| `seoul-museum-1183` | 200 | `image/jpeg`, 84,944 bytes, JPEG 시그니처 `FF D8 FF` | HTTP 200 | 프록시 이미지 |
| `SEOUL-GU-016-DONG-006-B001-P001` | 502 | 프록시가 이미지 본문을 반환하지 않음 | HTTP 200, `image/jpeg`, 79,899 bytes | 갤러리의 같은 기록 직접 URL fallback |
| `seoul-museum-1188` | 200 | `image/jpeg`, 118,942 bytes, JPEG 시그니처 `FF D8 FF` | HTTP 200 | 프록시 이미지 |

따라서 이미지 원문 네 건은 모두 실제 JPEG 응답을 반환했고, `/img` 프록시는 두 건에서 성공·두 건에서 502입니다. 실패한 두 건은 브라우저에서 같은 원문 이미지 URL을 대체로 시도하고, 갤러리에는 원문 링크를 남깁니다. ChatGPT 운영 화면에서 실제 카드 렌더링은 이 브랜치를 배포하기 전에는 확인할 수 없습니다.

## 회귀 및 배포 상태

- 사진 표시 관련 Node 22 테스트와 공개 MCP 패키지 통합: 30/30 통과.
- 전체 Node 22 테스트: 371개 중 354개 통과, 17개 실패. 실패는 기존 사진조사 데이터의 기대 행 수·해시 불일치와 mock fetch 응답 계약/외부 fetch 오류 등 이번 사진 출력 경로 밖에서 발생했습니다. 사진 하이라이트, 권한, 갤러리 메타데이터, MCP 패키지 테스트는 통과했습니다.
- TypeScript `typecheck`: 통과 (실행 호스트 Node 24.22.3).
- 공개 MCP 패키지 빌드: 통과.
- 이 브랜치는 main에서 분기한 Draft PR용 코드입니다. 운영 MCP에 새 사진 카드가 나타났는지는 아직 확인되지 않았으며, Production 배포도 수행하지 않았습니다.
