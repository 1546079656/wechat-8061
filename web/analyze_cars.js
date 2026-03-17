const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'message.text');
const input = fs.readFileSync(filePath, 'utf8');
const lines = input.split('\n');

let totalPriceCars = 0;
const uniquePriceCars = new Set();
let invalidLines = 0;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj && obj.content) {
            const content = obj.content;
            
            // 简单的价格过滤逻辑：只要包含我们之前总结的那些关键词之一
            const pricePattern = /(批发价|一口价|批车价|批发价格|价格：|价格:|小袁批发价|车易批批发价|纯批发价|秒杀价|明盘|同行拿)/;
            
            if (pricePattern.test(content) || (content.includes('批发') && /[0-9]+(\.[0-9]+)?[万wW]?/.test(content))) {
                totalPriceCars++;
                // 为了去重，我们可以使用 content 本身作为唯一特征
                // 但要去除一些可能的干扰，比如最前面的 wxid_xxx:\n 这种发件人前缀
                let cleanContent = content.replace(/^.*?:[\r\n]+/, '').trim();
                uniquePriceCars.add(cleanContent);
            }
        }
    } catch (e) {
        invalidLines++;
    }
}

console.log("================= 车辆与报价统计 ==================");
console.log(`总行数 (包括心跳、系统消息等): ${lines.length}`);
console.log(`无法解析的行数 (非 JSON): ${invalidLines}`);
console.log(`--------------------------------------------------`);
console.log(`包含「价格/批发/一口价」等关键字的车辆原始总数: ${totalPriceCars} 辆`);
console.log(`去重后，实际具有独特内容的独立车源数: ${uniquePriceCars.size} 辆`);
console.log(`--------------------------------------------------`);
console.log(`重复数据导致的冗余量: ${totalPriceCars - uniquePriceCars.size} 辆`);
console.log(`重复率: ${((totalPriceCars - uniquePriceCars.size) / totalPriceCars * 100).toFixed(2)}%`);
console.log("===================================================");
