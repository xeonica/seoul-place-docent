// Server data-ingestion only. UI receives the one matching receipt on each row.
import raw from '../data/photo-asset-proofs.json';
import {sourcePageKey,type PhotoAssetProof} from './photo-verification';
const proofs=raw as unknown as Record<string,PhotoAssetProof>;
export function photoProofFor(source:string|null){return proofs[sourcePageKey(source)||''];}
let displayUrls:Set<string>|undefined;
export function isRegisteredPhotoUrl(url:string){
 displayUrls??=new Set(Object.values(proofs).filter(proof=>proof.displayAllowed).flatMap(proof=>proof.displayImageUrls));
 return displayUrls.has(url);
}
