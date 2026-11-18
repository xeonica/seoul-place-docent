// Optional diagnostic. Reads existing environment only; never prints credentials.
import {searchAddresses} from '../lib/providers.ts';
import {buildingInfo} from '../lib/building-info.ts';
const queries=['서울 성동구 마장로42길 16','서울 성북구 삼선교로16길 116','서울 중랑구 중랑천로 20','서울 성동구 무학로6길 50'];
for(const query of queries){
 try{
  const result=await searchAddresses(query,1,process.env);
  if(result.candidates.length!==1||result.total!==1){console.log(JSON.stringify({query,status:'address_ambiguous',candidateCount:result.candidates.length}));continue;}
  const address=result.candidates[0];const building=await buildingInfo(address,process.env);
  console.log(JSON.stringify({query,address:address.roadAddr,jibunAddress:address.jibunAddr,name:address.bdNm,building}));
 }catch(error){console.log(JSON.stringify({query,status:'address_unavailable',errorCode:error?.code||'connection_error'}));}
}
