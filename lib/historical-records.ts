import {z} from 'zod';
import historicalNameResearch from '../data/historical-place-name-research-2026-10-23.json';

/** Existing archive_facts.scope taxonomy used by the Seoul docent's 2/3/5 parts. */
export const HISTORICAL_FACT_SCOPES=['toponymy','event','industrial_change','social_change','urban_space'] as const;
export const HistoricalFactScopeSchema=z.enum(HISTORICAL_FACT_SCOPES);
export type HistoricalFactScope=z.infer<typeof HistoricalFactScopeSchema>;

/**
 * A reviewed archive fact is always anchored to a source passage and a region.
 * `publicationDate` is kept separate from event/name validity years.
 */
export const HistoricalFactSchema=z.object({
 id:z.string().min(1),title:z.string().min(1),description:z.string().min(1),scope:HistoricalFactScopeSchema,
 timeLabel:z.string(),startYear:z.number().int().nullable(),endYear:z.number().int().nullable(),
 sourceId:z.string().min(1),sourceTitle:z.string().min(1),sourceUrl:z.string().url(),institution:z.string().min(1),
 publicationDate:z.string().nullable(),passageId:z.string().min(1),passageText:z.string().min(1),passageTextKind:z.enum(['quotation','transcription','paraphrase']),regionId:z.string().min(1),regionLevel:z.enum(['district','legal_dong']),
 relationScope:z.enum(['dong_context','district_context']),reviewStatus:z.literal('approved'),
});
export type HistoricalFact=z.infer<typeof HistoricalFactSchema>;

/** Historical toponym catalog entries stay candidates unless the old boundary and current area are independently aligned. */
export const HistoricalPlaceNameSchema=z.object({
 id:z.string().min(1),district:z.string().min(1),currentDong:z.string().min(1),currentRegionId:z.string().min(1),
 historicalName:z.string().min(1),variants:z.array(z.string().min(1)),historicalParent:z.string().min(1),periodLabel:z.string().min(1),
 currentDongType:z.enum(['legal_dong','administrative_dong','unresolved']),spatialRelation:z.literal('historical_area_candidate'),
 evidenceUrl:z.string().url(),evidenceLocator:z.string().min(1),evidenceMethod:z.string().min(1),checkedOn:z.string().min(1),
 reviewStatus:z.enum(['official_text_checked','metadata_only','needs_review']),
});
export type HistoricalPlaceName=z.infer<typeof HistoricalPlaceNameSchema>;

const historicalNameAliases=z.object({aliases:z.array(z.unknown())}).parse(historicalNameResearch).aliases;
export function historicalPlaceNamesForRegion(district:string,dong:string):HistoricalPlaceName[]{
 return historicalNameAliases.flatMap(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return[];
  const row=value as Record<string,unknown>,evidence=row.evidence&&typeof row.evidence==='object'?row.evidence as Record<string,unknown>:{};
  const parsed=HistoricalPlaceNameSchema.safeParse({id:row.id,district:row.district,currentDong:row.currentDong,currentRegionId:row.currentRegionId,historicalName:row.historicalName,variants:row.variants,historicalParent:row.parent,periodLabel:row.period,currentDongType:'unresolved',spatialRelation:'historical_area_candidate',evidenceUrl:evidence.url,evidenceLocator:evidence.locator,evidenceMethod:evidence.method,checkedOn:evidence.checkedOn,reviewStatus:evidence.method==='official_text_checked'?'official_text_checked':'needs_review'});
  return parsed.success&&parsed.data.district===district&&parsed.data.currentDong===dong?[parsed.data]:[];
 });
}

/** Event occurrence and publication chronology are intentionally separate. */
export const HistoricalEventSchema=z.object({
 id:z.string().min(1),title:z.string().min(1),eventDate:z.string().nullable(),eventStartYear:z.number().int().nullable(),eventEndYear:z.number().int().nullable(),
 publicationDate:z.string().nullable(),sourceId:z.string().min(1),sourceUrl:z.string().url(),sourceLocator:z.string().min(1),
 relationScope:z.enum(['exact_site','parcel','nearby','dong_context','district_context','uncertain']),reviewStatus:z.literal('approved'),
});
export type HistoricalEvent=z.infer<typeof HistoricalEventSchema>;

export function historicalFactTourKind(scope:HistoricalFactScope):'toponymy'|'event'|'urban_space'{
 if(scope==='toponymy')return 'toponymy';
 if(scope==='urban_space')return 'urban_space';
 return 'event';
}
