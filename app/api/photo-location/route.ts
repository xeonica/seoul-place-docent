import {handlePhotoLocation} from '@/lib/photo-upload';
import {env} from '@/lib/runtime-env';
export function POST(request:Request){return handlePhotoLocation(request,env);}
