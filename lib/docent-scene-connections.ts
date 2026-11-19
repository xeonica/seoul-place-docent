import type {StoryScene} from './docent-story';

/** Candidate links for narration, not verified historical continuity or causation. */
export type SceneConnection={fromEvidenceId:string;toEvidenceId:string;relation:'shared_named_place'|'chronological_context';sharedTerm:string;fromYear:number;toYear:number;verification:'candidate_only'};

const contextTerms=['한성대학교','한성여중','장수마을','삼선동','낙산','삼선시장','한옥','재개발','공학관','우촌관'];
const normalized=(value:string)=>value.replace(/\\s+/g,'');
/** Connect different dated records only when both explicitly name the same subject. */
export function sceneConnections(scenes:StoryScene[],placeName='',limit=12):SceneConnection[]{
  const focus=placeName.trim();
  const terms=[...new Set([...(focus.length>=3?[focus]:[]),...contextTerms])];
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
