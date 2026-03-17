const fs = require('fs');
const text = fs.readFileSync('message.text', 'utf8');
const lines = text.split('\n');

let singleLineIds = new Set();
let multiLineIds = new Set();

let inMulti = false;
let buffer = "";

for(let line of lines) {
  if (line.match(/^\{"sender":/)) {
     try {
       let obj = JSON.parse(line);
       if(obj.msgId) singleLineIds.add(obj.msgId);
     }catch(e){}
  } else if (line.trim() === '{') {
     inMulti = true;
     buffer = line;
  } else if (inMulti) {
     buffer += '\n' + line;
     if (line.trim() === '}') {
       try {
         let obj = JSON.parse(buffer);
         if(obj.msgId) multiLineIds.add(obj.msgId);
       } catch(e){}
       inMulti = false;
       buffer = '';
     }
  }
}

let exclusiveMulti = [...multiLineIds].filter(id => !singleLineIds.has(id));
console.log(`Single line ids: ${singleLineIds.size}`);
console.log(`Multi line ids: ${multiLineIds.size}`);
console.log(`Ids ONLY in Multi line: ${exclusiveMulti.length}`);
