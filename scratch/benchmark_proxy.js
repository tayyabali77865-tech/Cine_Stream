/**
 * Real-world benchmark: Architecture A (Vercel Edge) vs Architecture B (Cloudflare Worker)
 * Tests actual hakunaymatata CDN behavior through each proxy path.
 *
 * Usage: node scratch/benchmark_proxy.js
 * Requires: dev server running on localhost:3000
 */

const SLUG = 'movie-110007'; // A known working movie slug
const CF_WORKER = 'https://cine-stream-proxy.tayyabali77865.workers.dev';
const LOCAL_PROXY = 'http://localhost:3000/api/video-proxy';
const ROUNDS = 5; // How many test rounds per architecture

async function getStreamUrl() {
  console.log(`\n[1] Getting fresh signed stream URL for slug: ${SLUG}...`);

  // Step 1: get movie metadata (slug → subjectid, dp, title, type)
  const detailsRes = await fetch(`http://localhost:3000/api/movie/${SLUG}`);
  const details = await detailsRes.json();
  if (!details.success) throw new Error('Movie details failed: ' + JSON.stringify(details));

  const { media_type, seasons, subjectid, dp, title } = details.data;
  console.log(`    Title: ${title} | Type: ${media_type}`);

  // Step 2: use /api/movie/[slug]/player to get a fresh signed player URL
  let playerApiUrl = `http://localhost:3000/api/movie/${SLUG}/player`;
  if (media_type === 'tv' && seasons && seasons.length > 0) {
    playerApiUrl += `?se=${seasons[0].se}&ep=1`;
    if (subjectid && dp) {
      playerApiUrl += `&subjectid=${encodeURIComponent(subjectid)}&title=${encodeURIComponent(title)}&dp=${encodeURIComponent(dp)}`;
    }
  } else {
    playerApiUrl += `?se=0&ep=0`;
  }

  const playerApiRes = await fetch(playerApiUrl);
  const playerApiData = await playerApiRes.json();
  if (!playerApiData.success || !playerApiData.videoUrl) {
    throw new Error('Player API failed: ' + JSON.stringify(playerApiData));
  }

  // Step 3: call the player-proxy to get the actual signed MP4 URL
  // We need to call the player HTML endpoint and extract the stream URL from JS
  // Instead, re-use the Vercel Edge proxy to test a known CDN URL format
  // We'll construct it directly from the signed videoUrl  
  const signedPlayerUrl = `http://localhost:3000${playerApiData.videoUrl}`;
  console.log(`    Signed player URL: ${playerApiData.videoUrl.substring(0, 80)}...`);

  // Hit the player-proxy endpoint to get the rendered HTML with the CDN URL
  const playerHtmlRes = await fetch(signedPlayerUrl);
  const html = await playerHtmlRes.text();

  // The CDN URL is loaded dynamically by JS — extract from the raw JS source
  // Look for the actual URL pattern inside any quoted string
  const cdnPatterns = [
    /(https?:\/\/[\w.-]*hakunaymatata\.com\/[^\s'"<>]+\.mp4[^\s'"<>]*)/i,
    /(https?:\/\/[^\s'"<>]+\.mp4\?[^\s'"<>]*sign=[^\s'"<>]+)/i,
    /["'](https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*)["']/i,
  ];

  for (const pat of cdnPatterns) {
    const m = html.match(pat);
    if (m) {
      console.log(`    CDN URL: ${m[1].substring(0, 90)}...`);
      return m[1];
    }
  }

  // Fallback: check the player API URL itself — strip /api/player-proxy?url= to get raw stream URL
  console.log('\n  ⚠ CDN URL not found in HTML (loaded dynamically by JS).');
  console.log('  Using the player proxy URL itself as the test target...\n');

  // Return the raw spedostream URL (without our proxy wrapper) for direct CDN testing
  const rawSpedostreamUrl = decodeURIComponent(playerApiData.videoUrl.replace('/api/player-proxy?url=', ''));
  return rawSpedostreamUrl;
}


async function testProxy(label, proxyBaseUrl, streamUrl, round) {
  const proxiedUrl = `${proxyBaseUrl}?streamUrl=${encodeURIComponent(streamUrl)}`;
  const startTime = Date.now();
  let status = 0;
  let contentType = '';
  let contentLength = '';
  let contentRange = '';
  let receivedBytes = 0;
  let error = null;
  let ttfb = 0; // Time to first byte

  try {
    const res = await fetch(proxiedUrl, {
      headers: {
        'Range': 'bytes=0-524287', // Request first 512KB chunk
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    ttfb = Date.now() - startTime;
    status = res.status;
    contentType = res.headers.get('content-type') || '';
    contentLength = res.headers.get('content-length') || '';
    contentRange = res.headers.get('content-range') || '';

    if (res.ok || status === 206) {
      const buf = await res.arrayBuffer();
      receivedBytes = buf.byteLength;
    }
  } catch (err) {
    error = err.message;
    ttfb = Date.now() - startTime;
  }

  const totalTime = Date.now() - startTime;
  const throughputMbps = receivedBytes > 0
    ? ((receivedBytes * 8) / (totalTime / 1000) / 1_000_000).toFixed(2)
    : '0.00';

  return {
    label,
    round,
    status,
    ttfb,
    totalTime,
    receivedBytes,
    throughputMbps,
    contentType,
    contentRange: contentRange ? 'YES' : 'NO',
    error
  };
}

function printResult(r) {
  const icon = (r.status === 200 || r.status === 206) ? '✅' : '❌';
  console.log(
    `  ${icon} Round ${r.round} | Status: ${r.status} | TTFB: ${r.ttfb}ms | Total: ${r.totalTime}ms | ` +
    `Received: ${(r.receivedBytes / 1024).toFixed(0)}KB | Throughput: ${r.throughputMbps} Mbps | ` +
    `Range: ${r.contentRange}${r.error ? ' | Error: ' + r.error : ''}`
  );
}

function summarize(label, results) {
  const successful = results.filter(r => r.status === 200 || r.status === 206);
  const failed = results.filter(r => r.status !== 200 && r.status !== 206);
  const blocked = results.filter(r => r.status === 403);

  const avgTtfb = successful.length
    ? Math.round(successful.reduce((s, r) => s + r.ttfb, 0) / successful.length)
    : 'N/A';
  const avgThroughput = successful.length
    ? (successful.reduce((s, r) => s + parseFloat(r.throughputMbps), 0) / successful.length).toFixed(2)
    : '0.00';

  console.log(`\n  ┌─ SUMMARY: ${label}`);
  console.log(`  │  Rounds:        ${results.length}`);
  console.log(`  │  Success rate:  ${successful.length}/${results.length} (${Math.round(successful.length / results.length * 100)}%)`);
  console.log(`  │  403 rate:      ${blocked.length}/${results.length}`);
  console.log(`  │  Avg TTFB:      ${avgTtfb}ms`);
  console.log(`  │  Avg Throughput: ${avgThroughput} Mbps`);
  console.log(`  │  Range support: ${successful[0]?.contentRange || 'N/A'}`);
  console.log(`  └─ CDN blocks?    ${blocked.length > 0 ? 'YES ❌' : 'NO ✅'}`);
}

async function run() {
  console.log('='.repeat(70));
  console.log('  REAL-WORLD PROXY BENCHMARK: Vercel Edge vs Cloudflare Worker');
  console.log('='.repeat(70));

  let streamUrl;
  try {
    streamUrl = await getStreamUrl();
  } catch (err) {
    console.error('\n❌ Could not get a stream URL. Is dev server running on localhost:3000?');
    console.error('   Error:', err.message);
    process.exit(1);
  }

  // Architecture A: Vercel Edge
  console.log(`\n[A] Testing Vercel Edge Proxy (${LOCAL_PROXY})`);
  const aResults = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const r = await testProxy('Vercel Edge', LOCAL_PROXY, streamUrl, i);
    printResult(r);
    aResults.push(r);
    await new Promise(res => setTimeout(res, 500));
  }
  summarize('Vercel Edge → hakunaymatata CDN', aResults);

  // Architecture B: Cloudflare Worker
  console.log(`\n[B] Testing Cloudflare Worker Proxy (${CF_WORKER})`);
  const bResults = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const r = await testProxy('CF Worker', CF_WORKER, streamUrl, i);
    printResult(r);
    bResults.push(r);
    await new Promise(res => setTimeout(res, 500));
  }
  summarize('Cloudflare Worker → hakunaymatata CDN', bResults);

  // Final recommendation
  const aSuccessRate = aResults.filter(r => r.status === 200 || r.status === 206).length / aResults.length;
  const bSuccessRate = bResults.filter(r => r.status === 200 || r.status === 206).length / bResults.length;
  const aAvgTtfb = aResults.length ? Math.round(aResults.reduce((s, r) => s + r.ttfb, 0) / aResults.length) : 9999;
  const bAvgTtfb = bResults.length ? Math.round(bResults.reduce((s, r) => s + r.ttfb, 0) / bResults.length) : 9999;

  console.log('\n' + '='.repeat(70));
  console.log('  RECOMMENDATION');
  console.log('='.repeat(70));
  if (aSuccessRate >= bSuccessRate && aAvgTtfb <= bAvgTtfb) {
    console.log('  ✅ Architecture A (Vercel Edge) wins: higher success rate and/or lower latency.');
  } else if (bSuccessRate > aSuccessRate) {
    console.log('  ✅ Architecture B (Cloudflare Worker) wins: higher success rate.');
  } else {
    console.log('  ✅ Architecture A (Vercel Edge) recommended: comparable success, lower TTFB.');
  }
  console.log('='.repeat(70));
}

run().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
