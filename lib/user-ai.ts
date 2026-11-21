export const aiServices = {
 ChatGPT:{url:'https://chatgpt.com/',support:'원격 MCP 지원',conditions:'웹에서 사용자 MCP 추가 권한이 필요합니다. 워크스페이스 정책·보안 제한이 적용되며, 계정 화면에서 제공 여부를 확인하세요. 요금제별 전체 제공 범위는 미확인입니다.',steps:['Plugins에서 + → Add custom MCP server를 선택합니다.','검증된 공개 MCP 전용 URL을 입력하고 No authentication을 선택합니다. Sites 홈페이지의 /mcp 주소에는 이 설정을 사용하지 않습니다.','생성한 플러그인을 설치한 뒤 대화에서 @로 선택하고 질문을 붙여넣습니다.'],docs:'https://developers.openai.com/api/docs/guides/custom-mcp-server'},
 Claude:{url:'https://claude.ai/',support:'원격 MCP 지원',conditions:'Free(사용자 커넥터 1개), Pro·Max·Ultra·Team·Enterprise. 조직 계정은 소유자 또는 해당 관리 권한이 있는 담당자의 등록이 먼저 필요합니다.',steps:['Customize → Connectors에서 사용자 웹 커넥터를 추가합니다.','검증된 공개 MCP 전용 URL을 입력합니다. 해당 전용 서버는 No sign in을 선택합니다.','대화에서 커넥터를 활성화하고 복사한 질문을 입력합니다.'],docs:'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp'},
 Gemini:{url:'https://gemini.google.com/',support:'원격 MCP 지원 · 지역/계정 제한',conditions:'공식 안내 기준 미국의 만 18세 이상 개인 Google 계정, 영어, Keep Activity 켜짐이 필요합니다. 직장·학교 계정은 미지원이며 한국 계정에서의 제공은 확인되지 않았습니다. 구독 요금제별 보장은 없습니다.',steps:['웹 Settings → Connected Apps → Custom apps에서 앱을 추가합니다.','서버 URL을 입력하고 화면의 연결 안내를 따릅니다. 로그인 없는 공개 서버 연결 완료 여부는 미검증입니다.','연결 후 @로 앱을 선택하고 질문을 붙여넣습니다. 메뉴가 없으면 계정/지역 조건을 확인하세요.'],docs:'https://support.google.com/gemini/answer/17209137?hl=en-VU'},
} as const;
export function photoHistoryQuestion(){
 return '첨부한 스마트폰 원본 사진을 서울 장소 도슨트 MCP의 extract_photo_location에 file로 전달해 실제 EXIF GPS와 촬영 시각을 읽어 줘. 사진 외관으로 좌표나 주소를 추측하지 마. 파일이 전달되지 않거나 GPS가 없으면 그 상태를 알리고 원본 재첨부 또는 홈페이지의 사진 선택 방법을 안내해 줘. 주소 후보를 내가 확인하면 해당 token으로 prepare_place_answer를 호출하고 네가 도슨트 해설을 작성해 줘. 동네 기록과 사진 속 건물의 역사를 구분하고, 반환된 사진은 시기·출처와 함께 직접 보여 줘. 관련 영상의 원문 링크와 재생구간 검증 상태도 표시해 줘. 같은 token·question으로 validate_place_answer를 호출해 검사하고 미확인 내용은 보류해 줘.';
}
export function historyQuestion(address:string) {
 const place=address.trim().slice(0,100)||'사용자가 지정할 서울 주소';
 return `${place}에 대해 서울 장소 역사 도슨트 MCP 서버를 사용하여 역사와 공간 변화를 조사해 줘. 먼저 search_place를 실제 호출하고, 후보가 여러 개면 내가 선택하도록 물어봐. 선택한 token으로 prepare_place_answer를 호출해 공식 자료와 출처를 가져와. 웹 검색만으로 대신하지 말고 MCP 연결이 없으면 연결이 필요하다고 알려 줘. 반환된 근거만으로 네가 최종 해설을 작성하고 건물 자체의 역사와 주변 동네 역사를 구분해 줘. 가능한 경우 같은 token과 question으로 validate_place_answer를 호출해 기계적으로 검증해 줘. 출처·자료의 시기·검증 범위·미확인 사항을 표시해 줘. 사진과 관련 영상 후보가 있으면 원문 링크를 보여주고, 영상 시간 구간은 반환된 원자료 표기와 검증 상태를 구분해 줘. 그리고 사실 전체가 검증됐다고 단정하지 마. 도구 결과의 요청 ID도 보여 줘.`;
}
