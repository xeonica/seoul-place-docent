import {buildDocentTourV2} from './docent-tour-builder';
import type {DocentTourV2} from './docent-tour-schema';

type Obj=Record<string,unknown>;
const asObj=(value:unknown):Obj=>value&&typeof value==='object'&&!Array.isArray(value)?value as Obj:{};
const rows=(value:unknown):Obj[]=>Array.isArray(value)?value.map(asObj):[];

/** Adapts the existing place-answer/MCP packet without promoting unreviewed links to evidence. */
export function buildPlaceDocentTourV2(input:{packet:Obj;placeRecords:unknown;photos:unknown;videos:unknown;placeEvidenceLinks:unknown}):DocentTourV2{
  const packet=input.packet,links=rows(asObj(input.placeEvidenceLinks).items);
  const records=links.filter(item=>item.usableAsDirectEvidence===true&&typeof item.evidence==='string'&&typeof item.evidenceId==='string'&&item.evidenceId.length>0).map(item=>({
    evidenceId:item.evidenceId,title:item.title||'장소 연결 검토 근거',sourceUrl:item.sourceUrl,sourceInstitution:item.institution,mediaType:item.mediaType,
    relationType:item.reviewedRelation==='exact_site'?'exact_building':'exact_parcel',usableAsVerifiedEvidence:true,
    claims:[{claimId:item.evidenceId,text:item.evidence}],verification:{approvalActive:true},
  }));
  const recordIds=new Set(records.map(item=>item.evidenceId));
  const candidates=links.filter(item=>!recordIds.has(String(item.evidenceId||''))).map(item=>({
    evidenceId:String(item.evidenceId||item.linkId||'place-link-candidate'),title:item.title||'장소 연결 검토 후보',sourceUrl:item.sourceUrl,
    mediaType:item.mediaType,relationType:item.reviewedRelation||item.relation||'uncertain',usableAsVerifiedEvidence:false,
  }));
  const placeRecords=rows(input.placeRecords).map((record,index)=>({...record,id:typeof record.id==='string'?record.id:`building-register:${index+1}`}));
  const videoPacket=asObj(input.videos);
  return buildDocentTourV2({
    ...packet,evidence:{records,candidates},place:{...asObj(packet.place),records:placeRecords},registerDiagnostics:{records:[]},
    visuals:{...asObj(packet.visuals),photos:rows(input.photos)},videos:{...videoPacket,records:rows(videoPacket.records)},
  });
}
