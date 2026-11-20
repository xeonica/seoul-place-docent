/** Deployment provenance is reported only when supplied by the hosting runtime. */
export function deploymentInfo(settings:Record<string,string|undefined>){
 const sha=settings.VERCEL_GIT_COMMIT_SHA;
 return {commitSha:sha&&/^[a-f0-9]{40}$/i.test(sha)?sha:null,commitVerification:sha&&/^[a-f0-9]{40}$/i.test(sha)?'hosting_runtime_metadata':'unavailable',environment:['production','preview','development'].includes(settings.VERCEL_ENV||'')?settings.VERCEL_ENV:null,responseSchema:'integrated-docent-1'};
}
