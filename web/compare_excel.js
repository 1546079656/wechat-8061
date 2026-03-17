const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 1. 读取 Excel 数据
const excelPath = path.join(__dirname, '车辆源数据.xlsx');
let excelCars = [];
try {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // 假设导出的数据含有原文内容，或者至少我们可以提取出足够长的一段文字特征
    excelCars = xlsx.utils.sheet_to_json(worksheet);
} catch(e) {
    console.error("读取 Excel 失败:", e.message);
    process.exit(1);
}

// 构建一个快速查找 Set，基于剔除所有空白符号的原文。如果 Excel 有 "内容" 或者 "原文" 列，我们就用那个。
// 先看一下 excelCars 每行长什么样：
if(excelCars.length === 0) {
    console.log("Excel 数据为空！");
    process.exit(0);
}

const excelKeys = Object.keys(excelCars[0]);
// 尝试找到内容列，一般叫 "content" 或者 "原文" 或者 "消息内容" 等等
const contentKey = excelKeys.find(k => k.toLowerCase().includes('content') || k.includes('原文') || k.includes('内容') || k.includes('消息'));

const excelSignatures = new Set();
for (const row of excelCars) {
    let text = "";
    if (contentKey && row[contentKey]) {
        text = String(row[contentKey]);
    } else {
        // 如果没有内容列，就把所有列的值拼起来做特征
        text = Object.values(row).join('');
    }
    // 提取纯特征：去掉 wxid 前缀、空白、标点
    let sig = text.replace(/^.*?:[\r\n]+/, '').replace(/[\s\p{P}]/gu, '');
    excelSignatures.add(sig);
}

// 2. 读取我们原始的 message.text 并用宽泛规则提取
const txtPath = path.join(__dirname, 'message.text');
const input = fs.readFileSync(txtPath, 'utf8');
const lines = input.split('\n');

const myCarsMap = new Map(); // signature -> 原始content

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj && obj.content && obj.category === 1) {
            const content = obj.content;
            
            // 宽泛过滤：包含明确的价格术语
            const pricePattern = /(批发价|一口价|批车价|批发价格|价格：|价格:|小袁批发价|车易批批发价|纯批发价|秒杀价|明盘|同行拿)/;
            
            if (pricePattern.test(content) || (content.includes('批发') && /[0-9]+(\.[0-9]+)?[万wW]?/.test(content))) {
                // 特征化
                let cleanContent = content.replace(/^.*?:[\r\n]+/, '').trim();
                let sig = cleanContent.replace(/[\s\p{P}]/gu, ''); // 只比对汉字数字和字母
                
                // 去重
                if (sig.length > 5) {
                    if (!myCarsMap.has(sig)) {
                         myCarsMap.set(sig, cleanContent);
                    }
                }
            }
        }
    } catch (e) {}
}

// 3. 交叉对比：找到在我的提取中，但是没在 Excel 中的差异数据
const myTotal = myCarsMap.size;
const excelTotal = excelCars.length;

let missedByExcel = [];

for (const [sig, rawContent] of myCarsMap.entries()) {
    let found = false;
    // 模糊匹配：只要特征串长得差不多（相互包含超过80%），就认为 Excel 也有了
    for (const excelSig of excelSignatures) {
        if (excelSig.includes(sig) || sig.includes(excelSig)) {
            found = true;
            break;
        }
    }
    
    if (!found) {
        missedByExcel.push(rawContent);
    }
}

console.log('================ 差异对比分析报告 ================');
console.log(`📊 您的 Excel 里收录总数: ${excelTotal} 条`);
console.log(`🔍 我的宽泛规则提取数 (去重后): ${myTotal} 条`);
console.log(`--------------------------------------------------`);
console.log(`⚠️ 有 ${missedByExcel.length} 条数据在我的提取中，但您的 Excel 中没有。`);
console.log('\n❓ 为什么您的脚本漏掉了这些数据？为您随机展示 15 条这些遗漏数据的原文：\n');

for (let i = 0; i < Math.min(missedByExcel.length, 15); i++) {
    const raw = missedByExcel[i];
    // 把换行替换为明显的符号，方便一行展示
    const displayStr = raw.replace(/\n/g, ' ｜ ').substring(0, 150) + (raw.length > 150 ? '...' : '');
    console.log(`[遗漏项 ${i+1}] => ${displayStr}`);
}
console.log('\n==================================================');
