import { env } from '@/lib/runtime-env';
export function GET(){
 // This browser key is public by design. REST and other secrets never enter this response.
 return Response.json({javascriptKey:env.KAKAO_JAVASCRIPT_KEY||null,configured:!!env.KAKAO_JAVASCRIPT_KEY,domainRegistrationStatus:'not_checked',setupUrl:'https://apis.map.kakao.com/web/guide/'},{headers:{'Cache-Control':'no-store'}});
}
