# MCP 연결 안내

사이트 안에 MCP 서버가 함께 있습니다. 사이트를 배포하면 같은 호스트의 `/mcp`도 함께 배포됩니다. Vercel에 배포할 때는 [Vercel 배포 안내](vercel-deployment.md)에 따라 Next.js 빌드와 서버 환경변수를 설정합니다. 별도 예제 MCP 서버를 배포할 필요는 없습니다.

- 주소: `https://<사이트 주소>/mcp` (예: `https://seoul-place-history.xeonire.chatgpt.site/mcp`)
- 방식: HTTP POST(JSON-RPC). 예전 SSE 방식이 아니라 요청마다 HTTP로 주고받는 방식입니다.
- 클라이언트(ChatGPT, Claude, Cursor 등)의 "원격 MCP 서버" 설정에 위 주소를 넣으면 됩니다. 사이트가 로그인 전용이면 클라이언트에서도 로그인이 필요할 수 있습니다.

브라우저에서 `/mcp`를 직접 열면 GET 요청이므로 405가 반환될 수 있습니다. 이는 POST 기반 MCP 서버가 중단됐다는 뜻이 아닙니다. 클라이언트의 MCP 연결 설정에서 Streamable HTTP 주소로 등록하세요.

초기화 시 표준 MCP 버전 `2025-11-25`, `2025-06-18`, `2025-03-26`과 기존 Sites 버전 `2026-07-28`을 지원합니다. 요청한 버전이 지원되면 같은 버전을 응답하고, 미지원 버전이면 지원하는 표준 버전을 제안합니다. 기존의 단일 버전 강제 검사로 표준 클라이언트가 초기화 단계에서 거절되던 문제를 수정했습니다. [공식 MCP 버전 협상 규칙](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation)을 따릅니다.

## 도구
| 도구 | 하는 일 | AI 비용 |
|---|---|---|
| `search_place` | 서울 주소 검색, 후보마다 token 반환 | 없음 |
| `get_place_history` | 동네의 사진·문헌 기록과 출처를 시간순으로 반환 | 없음 (설명은 클라이언트의 AI가 작성) |
| `generate_place_answer` | **서버의 AI가 설명을 완성해서 반환** (아래) | 운영자 OpenAI 키. 저장된 설명은 무료 |
| `get_answer_stats` | 서버 AI 설명 KPI | 없음 |
| `get_archive_stats` | D1 자료 건수 | 없음 |

## generate_place_answer 흐름
주소 또는 token + 질문 → 질문과 맞는 기록 선택(최대 14개) → 서버 AI가 질문 유형 분류와 설명 작성 → 문단마다 근거 기록 id와 숫자 대조(맞지 않는 문단은 버림) → D1(`place_answer_cache`)에 30일 저장 → 완성된 설명 반환

- 도슨트 규칙(`lib/place-answer.ts`의 `DOCENT_RULES`): 기록에 있는 사실만, 장소와 동네 구분, 문단당 1~3문장, 문단마다 근거 연결, 확인되지 않은 내용은 `held`로 보류.
- 같은 동네·질문·기록이면 저장된 설명을 바로 돌려주고 AI를 다시 부르지 않습니다. 기록이 바뀌면 자동으로 새로 만듭니다.
- 새 설명 생성 한도: 이용자당 분당 6회, 전체 시간당 120회. 저장된 설명은 한도 없음.
- 비용: 설명 생성은 운영자 API 계정(`OPENAI_API_KEY`), MCP를 부르고 결과를 읽는 대화는 각 이용자의 ChatGPT·Claude 한도를 씁니다.

## KPI (`get_answer_stats`)
요청 수, 저장 재사용률, 성공률, 평균 생성 시간, 평균 저장 응답 시간, 검증에서 빠진 문단 비율, 보류(held) 건수, 질문 유형 분포. 기록은 D1 `place_answer_log`에 쌓입니다.
