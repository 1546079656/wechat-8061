const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'message.text');
const input = fs.readFileSync(filePath, 'utf8');

const lines = input.split('\n');
const priceFormats = new Set();
const rawExamples = new Set();

let totalCount = 0;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj && obj.content) {
            // 针对 content 里的每一行检查
            const contentLines = obj.content.split('\n');
            for (let cLine of contentLines) {
                cLine = cLine.trim();
                
                // 初步过滤包含关键字的行
                if (cLine.includes('批发价') || cLine.includes('一口价') || cLine.includes('批车价') || cLine.includes('价格') || cLine.includes('批：') || cLine.includes('批:') || cLine.includes('明盘') || cLine.includes('同行拿') || cLine.includes('批')) {
                    
                    // 尝试匹配格式：(前缀关键字) + (可能的分隔符) + (数字)(可能带"万"等单位)
                    // 这个正则会抓取类似 "【批发价】: 12.3万", "一口价 4.5", "批发价格：6"
                    const match = cLine.match(/^(.*?(?:批发价|一口价|批车价|批发价格|价格|秒杀价|同行|明盘|批).*?)[:：\s]*(\d+(\.\d+)?[万wW]?)/i);
                    
                    if (match) {
                        const formatKey = match[1].trim();
                        // 过滤掉太长的干扰句子（比如包含这些字的普通文本描述）
                        if (formatKey.length < 20) {
                            priceFormats.add(formatKey);
                            if (rawExamples.size < 50) {
                                rawExamples.add(cLine);
                            }
                            totalCount++;
                        }
                    } else {
                        // 有一些是直接包含在完整字符串中但没有被正则开头捕捉到
                        const matchInMiddle = cLine.match(/([^a-zA-Z0-9\n]{0,8}(?:批发价|一口价|批车价|批发价格|价格|秒杀价|明盘|同行拿|批)[^a-zA-Z0-9\n]{0,5})[\d\.]+/);
                        if (matchInMiddle && matchInMiddle[1].trim().length < 20) {
                             priceFormats.add(matchInMiddle[1].trim());
                             if (rawExamples.size < 50) {
                                rawExamples.add(cLine);
                             }
                             totalCount++;
                        }
                    }
                }
            }
        }
    } catch (e) {
        // 非法JSON跳过
    }
}

console.log(`✅ 在全集里共检测到 ${totalCount} 次报价。\n\n📌 提取到的各种【报价格式种类】：\n`);
Array.from(priceFormats).sort().forEach(fmt => {
    // 简单清洗一下后缀的多余冒号用来展示
    let cleanFmt = fmt.replace(/[:：]$/, '').trim();
    if (cleanFmt) console.log(`- "${cleanFmt}"`);
});

console.log('\n\n📌 真实的原文样本摘录 (部分)：');
Array.from(rawExamples).slice(0, 15).forEach(ex => {
    console.log(`> ${ex}`);
});
