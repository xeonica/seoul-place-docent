import {buildDocentTourV2} from './docent-tour-builder';
import type {DocentTourV2} from './docent-tour-schema';
import {HistoricalEventSchema,HistoricalFactSchema,historicalFactTourKind,historicalPlaceNamesForRegion} from './historical-records';

type Obj=Record<string,unknown>;
const asObj=(value:unknown):Obj=>value&&typeof value==='object'&&!Array.isArray(value)?value as Obj:{};
const rows=(value:unknown):Obj[]=>Array.isArray(value)?value.map(asObj):[];

/** Adapts the existing place-answer/MCP packet without promoting unreviewed links to evidence. */
export function buildPlaceDocentTourV2(input:{packet:Obj;placeRecords:unknown;photos:unknown;videos:unknown;placeEvidenceLinks:unknown;regionalHistoryFacts?:unknown}):DocentTourV2{
  const packet=input.packet,links=rows(asObj(input.placeEvidenceLinks).items);
  const approvedPlaceEvidence=links.filter(item=>item.usableAsDirectEvidence===true&&typeof item.evidence==='string'&&typeof item.evidenceId==='string'&&item.evidenceId.length>0).map(item=>({
    evidenceId:item.evidenceId,title:item.title||'장소 연결 검토 근거',sourceUrl:item.sourceUrl,sourceInstitution:item.institution,mediaType:item.mediaType,
    relationType:item.reviewedRelation==='exact_site'?'exact_building':'exact_parcel',usableAsVerifiedEvidence:true,
    claims:[{claimId:item.evidenceId,text:item.evidence}],verification:{approvalActive:true},
  }));
  const regionalFacts=rows(asObj(input.regionalHistoryFacts).records).map(item=>HistoricalFactSchema.safeParse(item)).filter(result=>result.success).map(result=>result.data);
  const regionalRecords=regionalFacts.map(item=>({evidenceId:item.id,title:item.title,sourceUrl:item.sourceUrl,sourceInstitution:item.institution,mediaType:item.scope==='event'?'article':item.scope==='toponymy'?'document':item.scope==='urban_space'?'map':'document',relationType:item.relationScope,historyKind:historicalFactTourKind(item.scope),usableAsVerifiedEvidence:true,claims:[{claimId:`${item.id}:claim`,text:item.description}],eventDate:['event','industrial_change','social_change'].includes(item.scope)?item.timeLabel:null,subjectPeriod:item.scope==='toponymy'?item.timeLabel:null,publicationDate:item.publicationDate,sourcePassage:item.passageText,sourcePassageId:item.passageId,sourcePassageType:item.passageTextKind,verification:{approvalActive:true}}));
  const historicalEvents=regionalFacts.filter(item=>['event','industrial_change','social_change'].includes(item.scope)).map(item=>HistoricalEventSchema.safeParse({id:item.id,title:item.title,eventDate:item.timeLabel||null,eventStartYear:item.startYear,eventEndYear:item.endYear,publicationDate:item.publicationDate,sourceId:item.sourceId,sourceUrl:item.sourceUrl,sourceLocator:item.passageId,relationScope:item.relationScope,reviewStatus:'approved'})).filter(result=>result.success).map(result=>result.data);
  const district=String(packet.district||''),dong=String(packet.dong||'');
  const recordIds=new Set([...approvedPlaceEvidence,...regionalRecords].map(item=>item.evidenceId));
  const candidates=links.filter(item=>!recordIds.has(String(item.evidenceId||''))).map(item=>({
    evidenceId:String(item.evidenceId||item.linkId||'place-link-candidate'),title:item.title||'장소 연결 검토 후보',sourceUrl:item.sourceUrl,
    mediaType:item.mediaType,relationType:item.reviewedRelation||item.relation||'uncertain',usableAsVerifiedEvidence:false,
  }));
  const placeRecords=rows(input.placeRecords).map((record,index)=>({...record,id:typeof record.id==='string'?record.id:`building-register:${index+1}`}));
  const videoPacket=asObj(input.videos);
  return buildDocentTourV2({
    ...packet,evidence:{records:[...approvedPlaceEvidence,...regionalRecords],candidates},historicalNames:historicalPlaceNamesForRegion(district,dong),historicalEvents,place:{...asObj(packet.place),records:placeRecords},registerDiagnostics:{records:[]},
    visuals:{...asObj(packet.visuals),photos:rows(input.photos)},videos:{...videoPacket,records:rows(videoPacket.records)},
  });
}
