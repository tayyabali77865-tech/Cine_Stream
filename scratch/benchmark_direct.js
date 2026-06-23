/**
 * Real-world direct benchmark: Architecture A (Vercel Edge) vs Architecture B (Cloudflare Worker)
 * Tests the proxies with a direct CDN URL from the network tab.
 *
 * The CDN URL is loaded dynamically in the browser by ArtPlayer JS — it cannot be
 * extracted server-side. Paste your most recent hakunaymatata.com URL below.
 *
 * To get a fresh URL:
 *   1. Open your site, play any movie
 *   2. Open DevTools → Network tab → filter by "hakunaymatata"
 *   3. Copy the full request URL and paste it as CDN_URL below
 *   4. Run: node scratch/benchmark_direct.js
 */

const CF_WORKER   = 'https://cine-stream-proxy.tayyabali77865.workers.dev';
const LOCAL_PROXY = 'http://localhost:3000/api/video-proxy';
const ROUNDS      = 5;

// ─── PASTE YOUR FRESH CDN URL HERE ──────────────────────────────────────────
const CDN_URL = 'https://bcdnxw.hakunaymatata.com/resource/3b2a8c5043e2c6648e3207c9f09a8f99.mp4?sign=fce58ff2b1ab9b9f6c1ed9ae441751de&t=1782241645';
// ────────────────────────────────────────────────────────────────────────────

async function testProxy(label, proxyBaseUrl, cdnUrl, round) {
  const proxiedUrl = `${proxyBaseUrl}?streamUrl=${encodeURIComponent(cdnUrl)}`;
  const start = Date.now();
  let status = 0, ttfb = 0, receivedBytes = 0, contentRange = '', error = null;

  try {
    const res = await fetch(proxiedUrl, {
      headers: {
        'Range': 'bytes=0-524287', // 512KB chunk
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    ttfb = Date.now() - start;
    status = res.status;
    contentRange = res.headers.get('content-range') || '';
    if (res.ok || status === 206) {
      const buf = await res.arrayBuffer();
      receivedBytes = buf.byteLength;
    }
  } catch (err) {
    error = err.message;
    ttfb = Date.now() - start;
  }

  const totalTime = Date.now() - start;
  const throughput = receivedBytes > 0
    ? ((receivedBytes * 8) / (totalTime / 1000) / 1_000_000).toFixed(2)
    : '0.00';

  return { label, round, status, ttfb, totalTime, receivedBytes, throughput, contentRange, error };
}

function printResult(r) {
  const icon = (r.status === 200 || r.status === 206) ? '✅' : (r.status === 403 ? '🚫' : '❌');
  console.log(
    `  ${icon} Round ${r.round} | HTTP ${r.status} | TTFB: ${r.ttfb}ms | Total: ${r.totalTime}ms | ` +
    `Recv: ${(r.receivedBytes/1024).toFixed(0)}KB | ${r.throughput} Mbps | ` +
    `Range: ${r.contentRange ? 'YES' : 'NO'}${r.error ? ' | ERR: ' + r.error : ''}`
  );
}

function summarize(label, results) {
  const ok  = results.filter(r => r.status === 200 || r.status === 206);
  const b403 = results.filter(r => r.status === 403);
  const avgTtfb = ok.length ? Math.round(ok.reduce((s, r) => s + r.ttfb, 0) / ok.length) : 'N/A';
  const avgThroughput = ok.length
    ? (ok.reduce((s, r) => s + parseFloat(r.throughput), 0) / ok.length).toFixed(2)
    : '0.00';

  console.log(`\n  ┌─ ${label}`);
  console.log(`  │  Success rate:     ${ok.length}/${results.length} (${Math.round(ok.length/results.length*100)}%)`);
  console.log(`  │  403 Blocked:      ${b403.length}/${results.length}`);
  console.log(`  │  Avg TTFB:         ${avgTtfb}ms`);
  console.log(`  │  Avg Throughput:   ${avgThroughput} Mbps`);
  console.log(`  │  Range Support:    ${ok.length && ok[0].contentRange ? 'YES (206 Partial)' : ok.length ? 'YES (200)' : 'N/A'}`);
  console.log(`  └─ CDN blocks path:  ${b403.length > 0 ? 'YES ❌' : ok.length > 0 ? 'NO ✅' : 'UNKNOWN'}`);
  return { ok: ok.length, b403: b403.length, avgTtfb, avgThroughput: parseFloat(avgThroughput) };
}

async function run() {
  console.log('='.repeat(70));
  console.log('  PROXY BENCHMARK: Vercel Edge vs Cloudflare Worker');
  console.log(`  CDN: ${CDN_URL.substring(0, 65)}...`);
  console.log('='.repeat(70));

  // Architecture A: Vercel Edge
  console.log(`\n[A] Vercel Edge Proxy  →  hakunaymatata CDN`);
  const aRes = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const r = await testProxy('Vercel Edge', LOCAL_PROXY, CDN_URL, i);
    printResult(r);
    aRes.push(r);
    await new Promise(r => setTimeout(r, 600));
  }
  const aSummary = summarize('ARCHITECTURE A: Vercel Edge → hakunaymatata', aRes);

  // Architecture B: Cloudflare Worker
  console.log(`\n[B] Cloudflare Worker  →  hakunaymatata CDN`);
  const bRes = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const r = await testProxy('CF Worker', CF_WORKER, CDN_URL, i);
    printResult(r);
    bRes.push(r);
    await new Promise(r => setTimeout(r, 600));
  }
  const bSummary = summarize('ARCHITECTURE B: Cloudflare Worker → hakunaymatata', bRes);

  // Final verdict
  console.log('\n' + '='.repeat(70));
  console.log('  OBSERVED RECOMMENDATION');
  console.log('='.repeat(70));

  if (aSummary.ok === 0 && bSummary.ok === 0) {
    console.log('  ⚠️  BOTH blocked — CDN URL is expired. Paste a fresh URL from DevTools.');
  } else if (bSummary.b403 > 0 && aSummary.b403 === 0) {
    console.log('  ✅ Use Architecture A (Vercel Edge) — Cloudflare Worker is blocked by CDN.');
  } else if (aSummary.b403 > 0 && bSummary.b403 === 0) {
    console.log('  ✅ Use Architecture B (Cloudflare Worker) — Vercel is blocked by CDN.');
  } else if (aSummary.avgTtfb !== 'N/A' && bSummary.avgTtfb !== 'N/A') {
    const winner = aSummary.avgTtfb <= bSummary.avgTtfb ? 'A (Vercel Edge)' : 'B (Cloudflare Worker)';
    console.log(`  ✅ Use Architecture ${winner} — lower average latency (${Math.min(aSummary.avgTtfb, bSummary.avgTtfb)}ms).`);
  } else {
    console.log('  ✅ Use Architecture A (Vercel Edge) — both passed but Vercel avoids CF-to-CF blocking risk.');
  }
  console.log('='.repeat(70));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
