const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'message.text');
const input = fs.readFileSync(filePath, 'utf8');
const lines = input.split('\n');

const fuzzyExamples = new Set();
let count = 0;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj && obj.content && obj.category === 1) {
            const content = obj.content;
            
            // 过滤条件：
            // 1. 不是那种规规整整写着 "【价格】" 或者 "批发价：" 这种标准的格式模板。
            // 2. 但是又包含金钱相关的暗示词汇，或者直接就是数字+万（例如 "8.5w", ".5出", "11要的来"）。
            // 3. 去掉纯系统消息或无意义短语。
            
            const isStandard = /(【(?:批发价?|一口价?|价格)?[】]|(?:批发价|一口价|批车价|批发价格)[:：])/.test(content);
            
            if (!isStandard) {
                // 寻找极度模糊但可能代表卖车价格的表达：
                // 如： "批 12.5", "10.8w带走", "底价大5", "明盘8" 等等
                const isFuzzyPrice = /(?:批|底价|明盘|全款|便宜|拉手|\b要的来)[：:\s]*([0-9\.]{1,4}[wW万]?)/i.test(content) || 
                                     /([0-9\.]{1,4})\s*[万wW]?(?:拉手|包过户|秒拿|带走)/i.test(content) ||
                                     // 像 "10.5万"，但排除公里数（万公里）
                                     /([0-9\.]{1,4})\s*[万wW](?!公里|公里)/i.test(content);

                // 粗略认定为车辆相关（排除聊天的 "ok", "在哪" 等）
                const isCarRelated = content.includes('年') || /(?:版|款|系)/.test(content) || /(?:原漆|车况|划痕)/.test(content);
                
                if (isFuzzyPrice && isCarRelated) {
                     // 简单清理下太长没用的头部
                     let cleanContent = content.replace(/^.*?:[\r\n]+/, '').trim();
                     cleanContent = cleanContent.replace(/#小程序.*?$/g, ''); // 砍掉小程序乱码链接
                     
                     if (cleanContent.length > 5 && cleanContent.length < 150) {
                         fuzzyExamples.add(cleanContent.replace(/\n/g, '  |  '));
                         count++;
                     }
                }
            }
        }
    } catch (e) {}
}

console.log(`✅ 在规整模板之外，发现了 ${count} 次极度口语化/模糊报价。`);
console.log(`\n📌 极度模糊的车源报价样本（摘录如下）：\n`);

let displayCount = 0;
for (const ex of fuzzyExamples) {
    console.log(`[样本 ${++displayCount}] ${ex}`);
    if (displayCount >= 20) break; // 最多显示20条
}
