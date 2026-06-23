export const config = {
  runtime: 'edge',
};

const ALLOWED_CDN_DOMAINS = [
  'pacdn.aoneroom.com',
  'spedostream2.shop',
  'imb.hair',
  'netmirror.global',
  'netmirror.hair',
  'fmoviesunblocked.net',
  'via.placeholder.com',
  'hakunaymatata.com',
  'spedostream.com',
  'spedostream.shop',
  'spedostream2.com',
];

function isValidProxyUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;
    // SSRF Prevention: block local/private IPs and loopbacks
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('169.254.')
    ) {
      return false;
    }
    // Allowlist check
    return ALLOWED_CDN_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');
    if (!imageUrl) {
      return new Response('url parameter is required', { status: 400 });
    }

    if (!isValidProxyUrl(imageUrl)) {
      return new Response('Forbidden: Target URL is not allowed', { status: 403 });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      return new Response('Failed to fetch image', { status: response.status });
    }

    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    });

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}
