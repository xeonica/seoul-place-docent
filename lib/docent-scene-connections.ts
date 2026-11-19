import type {StoryScene} from './docent-story';

/** Candidate links for narration, not verified historical continuity or causation. */
export type SceneConnection={fromEvidenceId:string;toEvidenceId:string;relation:'shared_named_place'|'chronological_context';sharedTerm:string;fromYear:number;toYear:number;verification:'candidate_only'};

const namedSubjectPattern=/[가-힣]{2,12}(?:대학교|초등학교|중학교|고등학교|마을|시장|공원|발전소|역|다리|교|궁|관|동)/g;
const normalized=(value:string)=>value.replace(/\\s+/g,'');
/** Connect different dated records only when both explicitly name the same subject. */
export function sceneConnections(scenes:StoryScene[],placeName='',limit=12):SceneConnection[]{
  const focus=placeName.trim();
  const candidates=scenes.flatMap(s=>[...(s.title.match(namedSubjectPattern)||[])]).filter(t=>t.length>=3);
  const counts=new Map<string,number>();for(const term of candidates)counts.set(term,(counts.get(term)||0)+1);
  const terms=[...new Set([...(focus.length>=3?[focus]:[]),...[...counts].filter(([,count])=>count>=2).map(([term])=>term)])].slice(0,30);
  const matches=(scene:StoryScene,term:string)=>normalized(scene.title+' '+scene.text).includes(normalized(term));
  const connections:SceneConnection[]=[];
  const used=new Set<string>();
  for(const term of terms){
    const relevant=scenes.filter(s=>s.year!==null&&matches(s,term)).sort((a,b)=>a.year!-b.year!||a.id.localeCompare(b.id));
    for(let i=1;i<relevant.length;i++){
      const a=relevant[i-1],b=relevant[i];
      if(a.id===b.id||a.year===b.year)continue;
      const key=[a.id,b.id].join('|');if(used.has(key))continue;used.add(key);
      connections.push({fromEvidenceId:a.id,toEvidenceId:b.id,relation:term===focus?'shared_named_place':'chronological_context',sharedTerm:term,fromYear:a.year!,toYear:b.year!,verification:'candidate_only'});
      if(connections.length>=limit)return connections;
    }
  }
  return connections;
}
