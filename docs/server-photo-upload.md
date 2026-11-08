# 원본 사진 서버 업로드와 주소 변환

## 사용 흐름

사진 선택 영역의 **서버 분석 사용** 동의를 선택한 뒤 원본을 고른다. 기본값인 기기 내 분석은 그대로다. 서버 경로는 다음과 같다.

`원본 바이트 POST → 서버 inspectPhotoGps/exifr → 실제 EXIF GPS → 기존 mapAddress() → 카카오 역지오코딩·공식 주소 후보 → 사용자 주소/동네 확인 → 기존 MCP token 조회`

사진의 GPS는 촬영 위치이고 피사체의 건물·부지 동일성을 증명하지 않는다. 사진 경로에서 운영자 모델은 자동 호출하지 않는다.

## HTTP API

- `POST /api/photo-location`
- 본문: 변환·리사이즈하지 않은 원본 파일 바이트. multipart, base64 JSON, 원격 이미지 URL은 받지 않는다.
- `Content-Type: image/jpeg` 또는 `image/heic`, `image/heif` (해당 sequence MIME도 허용). PNG는 GPS 없음으로 안내한다.
- `X-Photo-Consent: ephemeral-exif`: 원본·GPS의 서버 일시 처리 동의를 전달한다. 제공 UI에서는 기본 해제된 동의 선택으로 설정한다. 다른 클라이언트도 사용자에게 같은 처리를 알리고 동의를 받아야 한다.
- 서버 업로드는 **4MiB 이하**. Vercel Function 요청 제한을 고려한 값이다. 더 큰 원본은 기존 기기 내 분석(20MiB 이하) 또는 주소·지도·현재 위치를 사용한다. 이미지 압축은 EXIF를 제거할 수 있어 자동 변환하지 않는다.

```sh
curl 'https://실제배포호스트/api/photo-location' \
  -H 'Content-Type: image/jpeg' \
  -H 'X-Photo-Consent: ephemeral-exif' \
  --data-binary '@original.jpg'
```

성공 응답은 `inspection.point`(x=경도, y=위도), `result.location`, `result.candidates`, `needsConfirmation:true`, `retention:not_stored`를 포함한다. 후보 token을 사용자가 확인한 다음 기존 `prepare_place_answer`/`get_place_history`에 전달한다. 주소 제공기관에는 좌표/주소만 전달하고 사진은 보내지 않는다.

GPS/EXIF 실패는 422와 `inspection.status`/대체 입력 안내를 반환하며 주소 제공기관을 호출하지 않는다. 빈 파일/동의 누락은 400, 지원하지 않는 Content-Type은 415, 크기 초과는 413이다. 실제 바이트의 형식과 MIME이 다르면 422로 거절한다. 서울 외 좌표·API 키 미설정·제공기관 오류는 기존 주소 변환 오류를 사용한다.

## 보관·접근·자원 제한

애플리케이션은 원본과 추출 메타데이터를 DB/R2/파일/로그에 저장하지 않는다. 업로드 바이트는 요청 메모리에만 존재하며 처리가 끝나면 애플리케이션에서 재사용하거나 보관하지 않는다. 즉각적인 물리 메모리 소거를 보장하는 기능은 아니다. 호스팅의 전송 처리·접근 로그는 호스팅 정책의 적용을 받는다. 파일명은 요청에 보내지 않고 응답에는 좌표·주소·최소 검사 상태만 반환한다.

Origin 검사를 유지한다. 기존 홈페이지는 같은 호스트의 API를 사용한다. 공개 MCP 전용 패키지에도 같은 HTTP 경로를 포함하지만 관리자/수정 API는 추가하지 않는다. 외부 브라우저의 무제한 CORS는 제공하지 않는다.

인스턴스당 분당 12개 업로드, 동시 처리 2개를 제한한다. 초과는 429/Retry-After. Content-Length 유무와 관계없이 스트림을 실제로 세어 4MiB 초과 시 취소한다. 다중 인스턴스 전체 호출 제한은 호스팅 WAF에서 추가 설정해야 한다. 새 환경변수 없이 기존 `KAKAO_REST_API_KEY`와 `JUSO_API_KEY`를 재사용한다.

## 배포 패키지

Sites/전체 Next 앱은 `app/api/photo-location/route.ts`를 사용한다. 공개 MCP의 일반 소스 패키지는 `/api/public-mcp?__route=photo-location`, Build Output 패키지는 `/mcp?__route=photo-location`으로 rewrite하여 같은 처리 함수를 실행한다. Node 어댑터도 이 경로만 4MiB를 허용하며 기존 MCP 본문 제한은 유지한다.

이 HTTP API는 ChatGPT·Claude·Gemini가 일반 사진 첨부의 원본을 MCP에 자동 전달하도록 만드는 기능이 아니다. 원본에 접근할 수 있는 클라이언트가 명시적으로 업로드하거나 제공 웹 UI를 이용해야 한다. 기존 `resolve_photo_location` 도구 입력은 좌표 그대로이며 도구/입력 호환성을 유지한다.

## 검증 범위

`tests/photo-upload.test.mjs`: 원본 JPEG 바이트 → 실제 EXIF 파서 → 기존 카카오/JUSO 코드의 합성 공급자 응답 → 서명 주소 후보. 모델/임의 URL 호출 금지, 동의·MIME·실제 형식·GPS 없음·빈 파일·선언/실제 스트림 크기·서울 외·키 누락·Origin·호출량 제한을 검사한다.

`tests/photo-upload-package.integration.mjs`: 빌드한 공개 패키지의 직접 경로 및 두 rewrite 경로를 검사한다. 실제 운영 키 없이 파싱 이후 MAP_KEY_MISSING에 도달하는지 확인한다.

합성 EXIF는 실제 아이폰·갤럭시 원본 사진 실증을 대체하지 않는다. HEIC는 기존 exifr 경로와 테스트를 재사용한다. 운영 배포, 실기기 원본, AI 클라이언트 자동 파일 전달은 별도 검증 대상이다. 코드 수정이나 PR 생성만으로 배포 완료라고 보고하지 않는다.

### 이번 변경의 실행 기록 (2026-11-08)

- `pnpm typecheck`, `pnpm build:vercel`, `pnpm build`: 통과. 최초 Vercel 빌드는 작업 디스크 부족으로 실패했으며, 이 작업이 만든 캐시만 정리한 뒤 통과했다.
- `pnpm build:mcp-public:vercel`, 공개 업로드 패키지 검사: 통과.
- 업로드 전용 테스트 5개 및 모바일 Chromium 390×844 검사: 통과. UI 검사는 실제 파일 바이트 전송과 동의 기본 해제, 후보 표시, 중복 역지오코딩 없음에 대해 합성 응답을 사용했다.
- 전체 `pnpm test`: 테스트 파일 40개 중 37개 통과. 기존 integrated-research/photo-research/place-context 3개 실패는 수정 전 최신 main에서도 재현했다. 자료나 기존 테스트 기대값을 수정하지 않았다.
- 실제 스마트폰 원본/운영 배포·운영 주소 API 검사는 미수행이다.
