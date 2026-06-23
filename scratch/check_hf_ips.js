async function checkIps() {
  try {
    const workerBase = 'https://tayyabali888-tayyab.hf.space/proxy';
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${workerBase}?playerUrl=${encodeURIComponent('https://api.ipify.org')}`);
      const ip = await res.text();
      console.log(`Request ${i + 1} IP:`, ip.trim());
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error(err);
  }
}
checkIps();
