import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/archive/place-links/route.ts';

test('place-link write API rejects unauthenticated and cross-origin requests',async()=>{
 process.env.ARCHIVE_ADMIN_TOKEN='temporary-test-only';
 const url='https://docent.example/api/archive/place-links';
 const body=JSON.stringify({action:'register_place',place:{}});
 const unauth=await POST(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body}));
 assert.equal(unauth.status,403);
 const crossOrigin=await POST(new Request(url,{method:'POST',headers:{'content-type':'application/json','x-archive-admin':'temporary-test-only',origin:'https://attacker.example'},body}));
 assert.equal(crossOrigin.status,403);
 delete process.env.ARCHIVE_ADMIN_TOKEN;
});
