export const config = {
  runtime: 'edge',
};

const ALLOWED_CDN_DOMAINS = [
  'pacdn.aoneroom.com',
  'pbcdnw.aoneroom.com',
  'spedostream2.shop',
  'imb.hair',
  'imb.lat',
  'netmirror.global',
  'netmirror.hair',
  'fmoviesunblocked.net',
  'via.placeholder.com',
  'image.tmdb.org',
  'hakunaymatata.com',
  'spedostream.com',
  'spedostream.shop',
  'spedostream2.com',
  'media-amazon.com',
  'm.media-amazon.com',
  'imgshare.info',
  'imgshare.net',
  'aoneroom.com',
  'imdb.com',
  'img.youtube.com',
  'i.imgur.com',
  'imgflip.com',
  'staticflickr.com',
];

function isPrivateIp(ip) {
  if (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip === '::1' ||
    ip === '[::1]' ||
    ip.startsWith('10.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('127.')
  ) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  if (ip.startsWith('192.168.')) {
    return true;
  }
  return false;
}

function isValidProxyUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();
    
    if (
      isPrivateIp(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
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

    let currentUrl = imageUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 3;
    let response;

    while (redirectsFollowed < maxRedirects) {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isValidProxyUrl(nextUrl)) {
          return new Response('Forbidden: Redirect target is not allowed', { status: 403 });
        }
        
        currentUrl = nextUrl;
        redirectsFollowed++;
      } else {
        break;
      }
    }

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
