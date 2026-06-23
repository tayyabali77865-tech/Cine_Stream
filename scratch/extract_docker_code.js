const fs = require('fs');

const transcriptPath = 'C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\1a788e3c-7fc0-4f18-a2e6-6e7b5008eb77\\.system_generated\\logs\\transcript.jsonl';

function extract() {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 295 && obj.step_index <= 302) {
        console.log(`=== STEP ${obj.step_index} ===`);
        console.log(obj.content);
      }
    } catch (err) {}
  }
}
extract();
