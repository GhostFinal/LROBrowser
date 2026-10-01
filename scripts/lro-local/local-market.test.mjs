import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createMarketReader} from './local-market.mjs';

test('local reader restricts destination, methods and origins; strips credentials; caches queries', async()=>{
  const calls=[];
  const reader=createMarketReader(async(...args)=>{calls.push(args);return new Response('{"items":[{"id":1}],"nextCursor":null}');});
  const server=createServer((req,res)=>reader(req,res,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/?q=hat',{headers:{Cookie:'private',Authorization:'private'}})).status,200);
    assert.equal((await fetch(base+'/?q=hat')).status,200);
    assert.equal(calls.length,1);
    assert.equal(new URL(calls[0][0]).origin,'https://ltsd.ro');
    assert.equal(new URL(calls[0][0]).searchParams.get('limit'),'50');
    assert.equal(calls[0][1].headers,undefined);
    assert.equal(calls[0][1].credentials,'omit');
    assert.equal(calls[0][1].redirect,'error');
    assert.equal((await fetch(base+'/?url=https://example.com')).status,400);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/',{headers:{Origin:'https://example.com'}})).status,403);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('upstream failures do not become empty success results',async()=>{
  const reader=createMarketReader(async()=>{throw new Error('unavailable');});
  let status;
  await reader({method:'GET',headers:{}},{writeHead(code){status=code;},end(body){assert.match(body,/failed/);}},new URL('http://localhost/'));
  assert.equal(status,502);
});
