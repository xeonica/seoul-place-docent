# 사용자 AI와 연결하는 장소 도슨트 MCP

사이트와 같은 호스트의 `/mcp`에서 자료를 조회합니다. Sites와 Vercel의 기존 실행 환경을 유지합니다. [Vercel 배포 안내](vercel-deployment.md)를 참고하세요.

## 비용과 역할

MCP 도슨트는 모델 API를 호출하지 않습니다. 사용자 자신의 AI가 질문 분류, 최종 작성, 번역을 수행합니다. 서버는 위치 확인, 기록 선택, 사진·원문 출처, 기계적 검증을 제공합니다. 사용자의 토큰이나 구독을 서버로 옮기는 방식이 아닙니다. 호출한 AI 서비스의 요금제·이용 한도에 따라 대화가 처리되며, 서버는 실제 토큰 사용량이나 잔액을 조회할 수 없습니다.

이 변경은 MCP 도슨트 경로에 적용됩니다. 웹사이트의 별도 AI 설명·번역·음성 API는 별도 기능이며 운영자 키를 사용할 수 있습니다. MCP는 그 경로들을 호출하지 않습니다. 주소·지도 API 및 호스팅 비용은 여전히 운영 측 비용일 수 있습니다.

## 호출 순서

1. 주소가 있으면 `search_place`를 호출하고 주소 후보를 확인합니다.
2. 사진 GPS 또는 위치 공유 좌표가 있으면 `resolve_photo_location({latitude,longitude})`를 호출합니다. 좌표는 WGS84이며 경도·위도 순서를 바꾸지 않습니다.
3. 후보가 복수이거나 위치가 불확실하면 사용자가 확인하게 합니다. 확인한 token으로 진행합니다.
4. **호출한 AI가** 질문을 분류합니다. 유형: 동네 역사 / 시대별 모습 / 특정 장소·건물 / 사진 찾기 / 지명 유래 / 기타.
5. `prepare_place_answer({token,question,questionType})`를 호출합니다. address만 전달할 수도 있지만 주소 후보가 단 하나일 때만 진행합니다.
6. 받은 기록·사진·출처와 instructions로 호출한 AI가 도슨트를 작성합니다. 반환값은 완성된 설명이 아닙니다.
7. 가능하면 `validate_place_answer({token,question,answer})`로 문단을 검사하고 빠진 문단을 수정·보류한 후 사용자에게 보여 줍니다. 준비와 검증의 question은 같아야 합니다.

## 도구

| 도구 | 반환 |
|---|---|
| search_place | 서울 주소 후보와 30분 유효 token |
| resolve_photo_location | GPS에 대응하는 주소·동네 및 후보. 항상 사용자 확인 필요 |
| prepare_place_answer | 최대 14개 기록, 사진·출처, 분류 옵션·작성 규칙 |
| generate_place_answer | 이전 이름 호환. prepare와 같은 **근거 묶음** 반환; 서버 생성은 제거됨 |
| validate_place_answer | 근거 id·숫자·길이 검사, 통과 문단과 출처 |
| get_place_history | 묶은 장면을 시간순으로 페이지 조회 |
| get_answer_stats | 새 클라이언트 AI 경로의 관측치와 미측정 항목 |
| get_archive_stats | 연결 D1 아카이브 건수 |

### 사진의 한계와 개인정보

모바일 AI 앱이 EXIF를 제거하거나 MCP에 파일을 전달하지 않을 수 있습니다. 이 서버는 첨부 사진 원본을 수신·분석하는 도구를 제공하지 않습니다. 실제 EXIF GPS를 클라이언트가 추출해 전달하거나 사용자가 위치를 공유해야 합니다. GPS가 없으면 `resolve_photo_location({})`의 안내에 따라 주소를 요청합니다. 이미지 외관으로 좌표를 추측하지 않습니다. 촬영 위치와 피사체 위치는 다를 수 있습니다.

기존 지도 주소 변환을 재사용합니다. 서울 바깥 좌표는 거절하고 법정동만 확인된 경우에는 건물 token을 만들어 내지 않습니다. 건물 기록이 없으면 동네 기록임을 분명히 표시합니다. 사진 원본과 좌표·주소·질문·답변 본문은 새 KPI 로그에 저장하지 않습니다.

### 답변 JSON과 검증

```json
{
  "question_type": "시대별 모습",
  "paragraphs": [
    {"heading": "자료의 시기", "text": "근거에 있는 사실만 1~3문장으로 설명해요.", "evidence_ids": ["반환된 실제 기록 id"]}
  ],
  "held": ["건물 자체의 연혁은 확인할 수 없어요."]
}
```

사진은 대표 컷과 원문·기관·이용조건을 함께 안내합니다. 연대순으로 보여 주고 시기 미상은 마지막에 둡니다. 문단별 출처는 근거 보기로 분리할 수 있습니다. AI 설명 초안임을 표시합니다. 숫자와 id가 맞아도 의미적 사실 일치를 보증하지 않으므로 기계적 검증 통과를 '역사 사실 검토 완료'로 표시하지 않습니다.

## KPI

| 항목 | 목표 | 측정 범위 |
|---|---:|---|
| 전체 이용 성공률 | 90% 이상 | AI 앱에서 답변 완료까지 별도 실증 필요 |
| 사용자 AI 분류·작성 | 100% | 서버 모델 호출 제거; 실제 클라이언트 수행은 실증 필요 |
| MCP 요청당 운영자 AI 호출 | 0회 | MCP 코드에 모델 호출 경로 없음 |
| 출처 연결률 | 100% | 검증 도구로 id 존재 확인. 의미적 일치는 별도 검토 |
| 장소·동네 구분 정확도 | 95% 이상 | 대표 주소 평가표로 사람 검토 |
| 검색 P95 | 5초 이내 | MCP 준비 요청의 주소 확인·자료 선택 시간 |
| ChatGPT·Claude·Gemini 호환성 | 각각 통과 | 서비스별 연결·인증·사진 전달·답변 완료 실증 필요 |

`mcp_client_docent_log`에 검색·검증 요약만 기록합니다. 예전 운영자 AI 로그·캐시를 읽거나 합산하지 않습니다. 최근 최대 10,000건 표본이며 잘리면 sampled=true입니다. 자료 없음·입력 오류·상류 오류는 검색 실패로 집계합니다. 주소 후보 선택 대기는 답변 완료가 아니며 현재 검색 성공률 분모에서 제외합니다. 사용자 토큰과 최종 완료율은 미측정으로 반환합니다.

## 연결과 실증

엔드포인트 예: https://seoul-place-history.xeonire.chatgpt.site/mcp

각 서비스에서 원격 MCP를 연결할 수 있는 클라이언트·요금제·인증 경로를 확인해야 합니다. 코드 변경만으로 세 서비스의 지원이 보장되지 않습니다. 2026-07-28 discovery를 유지하며 2025-11-25·2025-06-18·2025-03-26 initialize 협상을 지원합니다. initialize의 알 수 없는 버전에는 지원하는 2025-11-25를 제안합니다. 실제 앱 연결·인증 호환은 별도 실증 대상입니다. [버전 협상 규칙](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)을 따릅니다.

대표 주소 3~5곳으로 다음을 각각 확인하고 결과를 기록하세요: 주소 단일 후보, 복수 후보 선택, GPS 있음, GPS 없음, 서울 외 좌표, 직접 장소 기록 없음, 자료 없음, 출처 연결, 추가 질문. 현재 세 서비스의 실증 상태는 requires_live_test입니다.

## 홈페이지 연결 안내와 관리자 감사 (2026-11-07)

상단 메뉴의 **AI 안내**로 `/ai-guide`에 이동해 서비스별 안내와 질문을 복사합니다. 주소 선택 후 **내 AI로 이 장소의 역사 알아보기**도 같은 페이지로 이동하며 선택한 주소를 반영합니다. 실제 계정 연결 완료 여부를 홈페이지가 자동 판별하지는 않습니다. [서비스별 조건·검증 보고서](user-ai-implementation.md)를 확인하세요. 특히 Gemini 일반 웹 연결은 공식 문서상 미국·성인·개인 계정·영어 등의 조건이 있어 한국 계정에서 사용할 수 있다고 보장하지 않습니다.

HTTP 요청에는 `Content-Type: application/json`, `Accept: application/json, text/event-stream`을 보냅니다. 본문은 32KiB 이하입니다. [2026-07-28 전송 규격](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)에 따라 현대 버전은 `MCP-Protocol-Version`, `Mcp-Method`, 도구 실행의 `Mcp-Name`을 검사하며 버전은 `params._meta["io.modelcontextprotocol/protocolVersion"]`와 일치해야 합니다. 알 수 없는 버전은 HTTP 400/-32022, 헤더 불일치는 400/-32020입니다. 기존 initialize 기반 버전도 유지합니다. 버전 헤더 생략은 2025-03-26 하위 호환 요청으로 처리합니다.

현대 버전은 `params._meta["io.modelcontextprotocol/clientCapabilities"]` 객체도 필수입니다(사용 기능이 없으면 `{}`). 필수 메타데이터 누락은 400/-32602로 거절합니다. 결과에는 `resultType:"complete"` 및 서버 정보 메타데이터를 포함합니다. [공통 메시지 규격](https://modelcontextprotocol.io/specification/2026-07-28/basic/index), [discovery 규격](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)을 참고하세요.

응답은 JSON이며 GET/DELETE는 405, 알림은 본문 없는 202입니다. 세션을 발급하지 않습니다. 동일 origin 또는 Origin 없는 서버 간 요청만 허용하며 별도 cross-origin 브라우저 CORS는 제공하지 않습니다. 인스턴스당 분당 120개 POST를 넘으면 429/Retry-After를 반환합니다. 배포 전체 제한은 WAF에서 추가해야 합니다.

각 실행 결과의 `_meta.requestId` 및 추가 텍스트 `serverReceipt.requestId`는 서버가 만든 UUID입니다. 관리자는 `/admin/mcp`에서 `ARCHIVE_ADMIN_TOKEN`으로 조회합니다. `/api/admin/mcp-stats`는 인증 전에는 로그를 반환하지 않습니다. `get_answer_stats`는 기존 공개 집계만 제공하고 새 요청별 로그는 노출하지 않습니다.

새 `mcp_tool_call_log`는 기존 KPI 테이블과 독립적이며 주소·질문·사진·GPS·API 키·AI 대화를 저장하지 않습니다. D1 저장 실패/미설정은 `auditPersisted:false`이며 구조화 호스팅 로그로 대체합니다. 요청 ID는 실제 저장된 로그와 대조해야 합니다. 클라이언트 종류는 미인증 추정이며 최종 답변 생성·토큰 소비·자료 사용을 증명하지 않습니다.

### 스마트폰 사진으로 시작하기

- 모바일 웹에서 GPS가 저장된 **JPEG 또는 HEIC/HEIF 원본(20MB 이하)**을 선택합니다. 사진 파일과 이미지 픽셀은 브라우저에 남고, 주소를 찾을 때 좌표만 기존 지도 주소 API로 보냅니다.
- 웹에서 촬영 위치에 해당하는 주소 후보를 고르면 기존 장소 화면에서 역사 이야기, 출처가 있는 사진과 관련 영상을 볼 수 있습니다. 주소 후보가 없고 법정동을 확인했으면 동네 기록을 표시합니다. GPS가 없거나 조회에 실패하면 주소를 입력하거나 지도에서 위치를 선택할 수 있습니다.
- **내 AI로 이 장소의 역사 알아보기**에서 확인한 주소가 담긴 질문을 복사해 MCP를 연결한 AI에 붙여넣습니다. AI가 원본 GPS를 실제로 전달할 수 있는 환경에서는 `resolve_photo_location`부터 시작하고, 반환된 후보를 사용자에게 확인합니다. 지원 여부는 AI 앱과 업로드 경로에 따라 달라집니다.
- `prepare_place_answer`의 `videos.records`는 기존 영상 카탈로그에서 찾은 최대 3개 후보입니다. 구간에는 원자료 시간 및 확인 상태가 포함됩니다. 구간이 기재되지 않은 경우와 구간 자료를 읽지 못한 경우는 `segmentStatus`로 구분합니다. 영상은 참고자료이며 문단의 기계적 검증에는 기존 역사 기록 ID를 사용합니다.

사진/현재 위치 결과의 운영자 AI 생성은 버튼으로 실행합니다. `videos.records[].verifiedSegments`만 검증된 시간 링크이며, 없으면 `playbackStatus`에 재생구간 미검증을 표시합니다. 기존 원자료 시간과 혼동하지 마세요. [사진 기반 구현·검증 보고서](photo-docent-implementation.md)를 참고하세요.

## 원본 사진 서버 처리

선택적으로 `POST /api/photo-location`에 동의 헤더와 원본 바이트를 보내면 서버가 EXIF GPS를 읽고 기존 주소 변환을 실행합니다. 후보 확인 후 기존 MCP token으로 진행합니다. 일반 채팅 첨부 파일이 자동 전달된다는 뜻은 아닙니다. [서버 업로드·개인정보·제한 안내](server-photo-upload.md)를 참고하세요.
