// The prod stage on workerd: this small Worker stands in for the static files layer of Cloudflare.
// It sends /api/* to the games Worker (src/index.js) and every other path to the files of areas/.
// workerd's disk service sets no Content-Type and serves no index.html, so this code adds both.
const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return env.API.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('not found', { status: 404 });

    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
    const file = await env.FILES.fetch(url, { method: request.method });
    // A directory without a slash answers with a listing: send the browser to the folder instead.
    if (file.ok && file.headers.get('Content-Type') === 'application/json' && !url.pathname.endsWith('.json')) {
      return Response.redirect(`${url.origin}${url.pathname}/`, 301);
    }
    if (!file.ok) return new Response('not found', { status: 404 });

    const type = TYPES[url.pathname.split('.').pop()] || 'application/octet-stream';
    return new Response(file.body, { headers: { 'Content-Type': type } });
  },
};
