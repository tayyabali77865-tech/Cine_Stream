const fs = require('fs');
const path = require('path');

const transcriptPath = 'C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\1a788e3c-7fc0-4f18-a2e6-6e7b5008eb77\\.system_generated\\logs\\transcript.jsonl';

function search() {
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    console.log('Total lines in transcript:', lines.length);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.toLowerCase().includes('dockerfile') || line.toLowerCase().includes('hugging') || line.toLowerCase().includes('express')) {
        console.log(`--- Match at line ${i} ---`);
        // Just print first 300 characters of the line to see what it is
        console.log(line.slice(0, 500));
      }
    }
  } catch (err) {
    console.error(err);
  }
}
search();
