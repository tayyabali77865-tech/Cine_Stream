const fs = require('fs');
const path = require('path');

async function downloadExtension() {
  const extensionId = 'imeeoinlogcehkhfjcopabijecfobcod';
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=110.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;

  try {
    console.log('Downloading extension from:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);

    const buffer = await res.arrayBuffer();
    const dest = path.join(__dirname, 'extension.zip');
    fs.writeFileSync(dest, Buffer.from(buffer));
    console.log('Saved extension to:', dest);
  } catch (err) {
    console.error('Error downloading extension:', err);
  }
}

downloadExtension();
