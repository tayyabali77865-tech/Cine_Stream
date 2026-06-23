const fs = require('fs');
const path = require('path');

function cleanCrx() {
  const src = path.join(__dirname, 'extension.zip');
  const dest = path.join(__dirname, 'clean_extension.zip');

  const buffer = fs.readFileSync(src);
  // Zip file local header signature is 0x04034b50 (PK\x03\x04)
  const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  const offset = buffer.indexOf(zipSignature);
  if (offset === -1) {
    console.error('Could not find ZIP signature in CRX file.');
    return;
  }

  console.log('ZIP signature found at offset:', offset);
  const cleanBuffer = buffer.slice(offset);
  fs.writeFileSync(dest, cleanBuffer);
  console.log('Saved clean ZIP file to:', dest);
}

cleanCrx();
