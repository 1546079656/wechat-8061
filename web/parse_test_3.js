const fs = require('fs');

const fileContent = fs.readFileSync('message.text', 'utf8');
const lines = fileContent.split('\n');

let count1 = 0;
let seenIds = new Set();
let inMulti = false;
let buffer = "";

function processObj(obj) {
  if (obj && obj.msgId && obj.category === 1 && obj.content) {
    if (!seenIds.has(obj.msgId)) {
      seenIds.add(obj.msgId);
      count1++;
    }
  }
}

for (let line of lines) {
  if (line.match(/^\{"sender":/)) {
    try { processObj(JSON.parse(line)); } catch(e){}
  } else if (line.trim() === '{') {
    inMulti = true;
    buffer = line;
  } else if (inMulti) {
    buffer += '\n' + line;
    if (line.trim() === '}') {
       try { processObj(JSON.parse(buffer)); } catch(e){}
       inMulti = false;
       buffer = '';
    }
  }
}

console.log(`Unique category 1 messages found: ${count1}`);
