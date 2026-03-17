const fs = require('fs');

const fileStream = fs.readFileSync('message.text', 'utf8').split('\n');

const regexModel = /【(?:车辆(?:型号|款型|款式)|品牌车系)[】:：\s]*([^\n]+)/;
const regexPrice = /(?:批发价|一口价|【?批发价】?|车辆价格|【?新车(?:指导)?价格】?)[】:：\s]*([0-9\.]+)/;

let seen = new Set();
let count = 0;
let inMulti = false;
let buffer = "";

function processObj(msg) {
  if (msg && msg.category === 1 && msg.content && msg.msgId) {
    if (!seen.has(msg.msgId)) {
       seen.add(msg.msgId);
       if (msg.content.match(regexModel) && msg.content.match(regexPrice)) {
          count++;
       }
    }
  }
}

for (let line of fileStream) {
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
console.log(`Original regex with dedup: ${count}`);
