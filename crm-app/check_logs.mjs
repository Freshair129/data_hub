import fs from 'fs';
import path from 'path';

const dir = 'automation/logs/feb_2026_chats';

if (!fs.existsSync(dir)) {
  console.log('Directory not found:', dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let totalSenders = 0, hasText = 0, hasId = 0, realMsgId = 0;

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const s of (d.senders || [])) {
    totalSenders++;
    if (s.msgText) hasText++;
    if (s.msgId) hasId++;
    // Real FB message ID: long numeric string, not just threadID with 0 prefix
    if (s.msgId && s.msgId.length > 12 && s.msgId[0] !== '0') realMsgId++;
  }
}

console.log('Files          :', files.length);
console.log('Total senders  :', totalSenders);
console.log('Has msgText    :', hasText, '(' + (totalSenders ? (hasText/totalSenders*100).toFixed(1) : 0) + '%)');
console.log('Has msgId      :', hasId,   '(' + (totalSenders ? (hasId/totalSenders*100).toFixed(1)   : 0) + '%)');
console.log('Real msgId     :', realMsgId);
