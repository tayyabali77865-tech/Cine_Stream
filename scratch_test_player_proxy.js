async function testSpedostream() {
  try {
    console.log('Testing direct access to spedostream2.shop...');
    const res = await fetch('https://spedostream2.shop/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.global/'
      }
    });
    console.log('Status:', res.status);
    console.log('Remote IP via headers - Server:', res.headers.get('server'));
    console.log('CF-Ray:', res.headers.get('cf-ray'));
    console.log('SUCCESS: spedostream2.shop is reachable from local!');
  } catch (err) {
    console.error('FAILED to reach spedostream2.shop:', err.message);
  }
}
testSpedostream();
