import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPlaceMatch} from '../lib/place-linking.ts';

const base={sourceUrl:'https://museum.example/record/1',institution:'서울역사박물관',evidence:'원문 본문에 해당 장소의 기록임을 명시',recordDistrict:'마포구',placeDistrict:'마포구'};
test('district and name-only links never become exact-site matches',()=>{
 const byDistrict=classifyPlaceMatch({...base,relationDeclared:'exact_site',reviewStatus:'pending',placeReviewStatus:'pending'});
 assert.equal(byDistrict.relation,'district_context');assert.equal(byDistrict.declaredRelation,'exact_site');assert.equal(byDistrict.reviewStatus,'pending');assert.equal(byDistrict.approvable,false);
 const byName=classifyPlaceMatch({...base,relationDeclared:'exact_site',reviewStatus:'approved',placeReviewStatus:'verified',recordPlaceId:'당인리발전소',placeId:'다른_당인리발전소'});
 assert.equal(byName.relation,'district_context');assert.equal(byName.reviewStatus,'pending');
});
test('verified building/PNU identity remains a pending exact-site candidate until separate review',()=>{
 const building=classifyPlaceMatch({...base,relationDeclared:'exact_site',reviewStatus:'pending',placeReviewStatus:'verified',placeType:'building',recordBuildingManagementNumber:'B-1',placeBuildingManagementNumber:'B-1'});
 assert.equal(building.relation,'exact_site');assert.equal(building.matchMethod,'building_management_number');assert.equal(building.reviewStatus,'pending');assert.equal(building.approvable,true);
 const parcel=classifyPlaceMatch({...base,relationDeclared:'parcel',reviewStatus:'pending',placeReviewStatus:'verified',placeType:'parcel',recordPnu:'P-1',placePnu:'P-1'});
 assert.equal(parcel.relation,'parcel');assert.equal(parcel.matchMethod,'pnu');assert.equal(parcel.reviewStatus,'pending');assert.equal(parcel.approvable,true);
});
test('coordinates classify nearby with measured distance, never exact-site',()=>{
 const result=classifyPlaceMatch({...base,recordLatitude:37.55,recordLongitude:126.92,recordCoordinateSource:'official-address-api',placeLatitude:37.551,placeLongitude:126.92,placeCoordinateSource:'official-address-api'});
 assert.equal(result.relation,'nearby');assert.ok(result.distanceMeters>100&&result.distanceMeters<120);assert.equal(result.approvable,false);
});
test('unsupported, distant, and malformed candidates stay uncertain',()=>{
 const badUrl=classifyPlaceMatch({...base,recordDistrict:'',placeDistrict:'',sourceUrl:'javascript:alert(1)',recordBuildingManagementNumber:'B',placeBuildingManagementNumber:'B',placeReviewStatus:'verified'});
 assert.equal(badUrl.relation,'uncertain');assert.equal(badUrl.approvable,false);
 const distant=classifyPlaceMatch({...base,recordLatitude:37.5,recordLongitude:126.9,recordCoordinateSource:'official-address-api',placeLatitude:37.7,placeLongitude:127.2,placeCoordinateSource:'official-address-api',distanceThresholdMeters:500});
 assert.equal(distant.relation,'district_context');
 const malformed=classifyPlaceMatch({...base,recordLatitude:999,recordLongitude:126,placeLatitude:37.5,placeLongitude:126});
 assert.equal(malformed.distanceMeters,null);assert.equal(malformed.relation,'district_context');
});
