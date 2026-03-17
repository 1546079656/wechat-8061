const fs = require('fs');
const readline = require('readline');

async function run() {
  const fileStream = fs.createReadStream('message.text');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalLines = 0;
  let jsonLines = 0;
  let nonJsonLines = 0;
  let textMessages = 0;
  
  const msgIds = new Set();
  const categoryCount = {};
  
  for await (const line of rl) {
    totalLines++;
    if (!line.startsWith('{')) {
      nonJsonLines++;
      continue;
    }
    
    try {
      const obj = JSON.parse(line);
      jsonLines++;
      const cat = obj.category;
      if (cat !== undefined) {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      }
      if (obj.msgId) {
          msgIds.add(obj.msgId);
      }
    } catch (e) {
      nonJsonLines++;
    }
  }

  console.log(`Total lines: ${totalLines}`);
  console.log(`JSON lines: ${jsonLines}`);
  console.log(`Non-JSON lines: ${nonJsonLines}`);
  console.log(`Unique msgIds: ${msgIds.size}`);
  console.log(`Categories count:`, categoryCount);
}
run();
