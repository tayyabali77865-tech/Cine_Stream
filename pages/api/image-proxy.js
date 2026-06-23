export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');
    if (!imageUrl) {
      return new Response('url parameter is required', { status: 400 });
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
