export const config = { runtime: 'edge' };

const ALLOWED_ASSET_DOMAINS = [
  'netmirror.global',
  'netmirror.hair',
  'spedostream2.shop',
  'spedostream.com',
  'spedostream.shop',
  'spedostream2.com',
  'imb.hair',
  'fmoviesunblocked.net',
];

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const assetUrl = searchParams.get('url');

  if (!assetUrl) return new Response('Missing url param', { status: 400 });

  let parsed;
  try {
    parsed = new URL(assetUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_ASSET_DOMAINS.some(
    d => hostname === d || hostname.endsWith('.' + d)
  );
  if (!isAllowed) return new Response('Forbidden: domain not allowed', { status: 403 });

  try {
    const res = await fetch(assetUrl, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
    });

    const contentType = res.headers.get('content-type') || 'application/javascript';

    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch (err) {
    return new Response('Failed to fetch asset: ' + err.message, { status: 502 });
  }
}
