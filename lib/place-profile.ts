import {buildingInfo} from './building-info';
import {closedBuildings,type PlaceContextSecrets} from './place-context';
import {placeRegisterRecords} from './place-answer';
import {placeEntity} from './place-entity';
import type {Address,Secrets} from './providers';
export async function getBuildingProfile(address:Address,secrets:Secrets&PlaceContextSecrets){
 const [building,closed]=await Promise.allSettled([buildingInfo(address,secrets),closedBuildings(address,secrets)]);
 // buildingInfo normally handles all provider failures. Rejected input is not fabricated.
 if(building.status==='rejected')throw building.reason;
 const closedData=closed.status==='fulfilled'?closed.value:null;
 const closedStatus=closed.status==='fulfilled'?{status:closed.value.items.length?'available':'not_found',queriedAt:closed.value.queriedAt}: {status:'unavailable',errorCode:closed.reason?.code||'PROVIDER_ERROR'};
 const records=await placeRegisterRecords(address,secrets,building.value,closedData);
 const entity={...placeEntity(address),buildingRegisterId:building.value.status==='verified'?building.value.records[0]?.registerId||null:null};
 return {entity,building:building.value,closed:closedStatus,records,complex:{status:'unverified',apartmentComplexCode:null},historicalStatus:'unverified'};
}
