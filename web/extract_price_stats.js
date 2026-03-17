const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'message.text');
const input = fs.readFileSync(filePath, 'utf8');

const lines = input.split('\n');

const stats = {};
let totalExtracted = 0;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj && obj.content) {
            const contentLines = obj.content.split('\n');
            for (let cLine of contentLines) {
                cLine = cLine.trim();
                
                // 更精准的正则提取：找"关键词"（允许前面带点符号）+ 冒号/空格 + 数字
                const match = cLine.match(/^(.*?(?:批发价|一口价|批车价|批发价格|价格|秒杀价|明盘|批))(?:\s*[:：]\s*|\s+)(\d+(\.\d+)?)/);
                
                if (match) {
                    let key = match[1].trim();
                    
                    // 清理掉太长的或不合理的句子前缀（比如一整段话里带了价格）
                    if (key.length > 20) {
                        // 只保留最后几个字符
                        key = key.substring(key.length - 10).trim();
                    }
                    
                    stats[key] = (stats[key] || 0) + 1;
                    totalExtracted++;
                } else if (cLine.includes('批发') && cLine.match(/批发.*?(\d+(\.\d+)?[万wW]?)/)) {
                     // 模糊匹配如 "批发10万"
                     const m = cLine.match(/^(.*?批发).*?(\d+(\.\d+)?)/);
                     if (m && m[1].length < 15) {
                         let k = m[1].trim();
                         stats[k] = (stats[k] || 0) + 1;
                         totalExtracted++;
                     }
                }
            }
        }
    } catch (e) {
    }
}

const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
console.log(`总计提取到有效报价: ${totalExtracted} 条\n`);
console.log(`【前缀形式排行榜】 (出现次数):`);
sorted.forEach(([k, c]) => {
    console.log(`${c}次\t->  "${k}"`);
});
