const fs = require('fs');

const transcriptPath = 'C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\1a788e3c-7fc0-4f18-a2e6-6e7b5008eb77\\.system_generated\\logs\\transcript.jsonl';

function search() {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.toLowerCase().includes('rotation') || line.toLowerCase().includes('public proxy')) {
      console.log(`--- Match at line ${i} ---`);
      console.log(line.slice(0, 800));
    }
  }
}
search();
