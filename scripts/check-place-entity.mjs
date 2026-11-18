import {resolvePlaceEntity} from '../lib/place-entity.ts';
for(const query of ['서울 성동구 마장로42길 16','서울 성동구 마장동 784','마장동 세림아파트','세림아파트']){
 try{const result=await resolvePlaceEntity({query},process.env);console.log(JSON.stringify({query,placeId:result.placeId,matchStatus:result.matchStatus,candidateCount:result.candidates.length}));}
 catch(error){console.log(JSON.stringify({query,matchStatus:'unavailable',errorCode:error?.code||'connection_error'}));}
}
