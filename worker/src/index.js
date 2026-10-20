// The Worker of games.productowner.ro. Cloudflare serves the files of areas/ as static assets;
// only /api/* reaches this code. It uses only standard Worker APIs, so workerd can run it too.
const API_URL = 'https://api.typesafe.ai/v1/systemone';

export default {
  async fetch(request, env) {
    // A path that is no static file and no API route, for example a file that .assetsignore keeps out.
    const { pathname } = new URL(request.url);
    if (request.method !== 'POST' || pathname !== '/api/jev') return new Response('not found', { status: 404 });
    // POST /api/jev passes the request on to TypeSafe, so the key stays out of the browser.
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: await request.text(),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
