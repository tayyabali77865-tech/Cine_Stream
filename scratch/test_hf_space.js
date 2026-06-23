async function test() {
  try {
    const res = await fetch('https://tayyabali888-tayyab.hf.space/proxy');
    console.log('Status:', res.status);
    console.log('Headers:', Object.fromEntries(res.headers.entries()));
    const body = await res.text();
    console.log('Body:', body.slice(0, 500));
  } catch (err) {
    console.error(err);
  }
}
test();
