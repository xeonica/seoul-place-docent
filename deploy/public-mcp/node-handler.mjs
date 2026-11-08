import app from './app.mjs';
/** Node HTTP adapter for the Vercel Build Output API. */
export default async function handler(req,res){
 const protocol=req.headers['x-forwarded-proto']||'https';
 const host=req.headers['x-forwarded-host']||req.headers.host;
 const url=new URL(req.url,`${protocol}://${host}`);
 const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
 let body;if(!['GET','HEAD'].includes(req.method)){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(url.pathname==='/api/photo-location'||url.searchParams.get('__route')==='photo-location'?4*1024*1024:1024*1024)){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
 const response=await app.fetch(new Request(url,{method:req.method,headers,...(body?{body}:{} )}));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}
