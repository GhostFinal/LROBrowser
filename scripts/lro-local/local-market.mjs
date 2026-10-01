// Local development service only; never included in the signed client bundle.
const endpoint = 'https://ltsd.ro/api/v1/market/search';
const allowed = new Set(['q', 'map', 'sort', 'shop_type', 'limit', 'cursor', 'item_id', 'option', 'option_mode']);
export function createMarketReader(fetcher = fetch) {
  const cache = new Map();
  let running = 0;
  return async function readMarket(request, response, url) {
    const reply = (status, body) => {
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
      response.end(body);
    };
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}` && !/^isolated-app:\/\/[a-z0-9]+$/.test(origin)) {
      reply(403, '{"error":"origin"}'); return;
    }
    if (request.method !== 'GET') { reply(405, '{"error":"method"}'); return; }
    if (url.search.length > 8192 || [...url.searchParams.keys()].some(key => !allowed.has(key))) {
      reply(400, '{"error":"query"}'); return;
    }
    const target = new URL(endpoint);
    target.search = url.search;
    target.searchParams.set('limit', '50');
    target.searchParams.set('shop_type', 'sell');
    const key = target.href;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < 30000) { reply(200, hit.body); return; }
    if (running >= 4) { reply(429, '{"error":"busy"}'); return; }
    running++;
    try {
      // No incoming headers, cookies, authorization, or request body are forwarded.
      const upstream = await fetcher(key, {method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000)});
      if (!upstream.ok) { reply(upstream.status, JSON.stringify({error: 'market unavailable'})); return; }
      const body = await upstream.text();
      if (body.length > 4 * 1024 * 1024 || !Array.isArray(JSON.parse(body).items)) throw new Error('Invalid market data');
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, {time: Date.now(), body});
      reply(200, body);
    } catch { reply(502, '{"error":"market connection failed"}'); }
    finally { running--; }
  };
}
