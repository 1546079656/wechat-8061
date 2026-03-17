const fs = require('fs');

const commonBrands = [
  "奔驰", "宝马", "奥迪", "保时捷", "路虎", "捷豹", "沃尔沃", "凯迪拉克", "雷克萨斯", "林肯", "玛莎拉蒂",
  "丰田", "本田", "日产", "大众", "别克", "雪佛兰", "福特", "现代", "起亚", "马自达", "标致", "雪铁龙",
  "特斯拉", "理想", "蔚来", "小鹏", "比亚迪", "极氪", "零跑", "问界", "阿维塔", "腾势", "深蓝",
  "吉利", "长安", "长城", "哈弗", "坦克", "魏牌", "领克", "五菱", "红旗", "广汽", "传祺", "奇瑞",
  "迈巴赫", "宾利", "劳斯莱斯", "法拉利", "兰博基尼", "阿斯顿·马丁", "迈凯伦",
  "斯巴鲁", "三菱", "铃木", "斯柯达", "捷达", "宝骏", "迈腾", "帕萨特", "途观", "汉兰达", "塞纳",
  "皇冠陆放", "普拉多", "雅阁", "思域", "埃尔法", "卡罗拉", "轩逸", "天籁"
];
const brandRegex = new RegExp("(" + commonBrands.join("|") + ")", "i");

function extractCarInfo(content) {
  let model = "";
  let price = "";
  let brand = "";

  // 1. 提取型号
  const structuredModelMatch = content.match(/【(?:车辆型号|车辆款型|车辆款式|品牌车系)[】:：\s]*([^\n]+)/);
  if (structuredModelMatch) {
    model = structuredModelMatch[1].trim();
  } else {
    // 去非结构化文本中找包含品牌的短句
    const lines = content.split('\n');
    for (let line of lines) {
      if (brandRegex.test(line)) {
        model = line.trim();
        break; // 找到第一句带品牌的作为型号
      }
    }
  }

  // 2. 提取价格
  const structuredPriceMatch = content.match(/(?:批发价?|一口价|【?批发价】?|车辆价格|【?新车(?:指导)?价格】?)[】:：\s]*([0-9\.]+)/);
  if (structuredPriceMatch) {
    price = structuredPriceMatch[1].trim();
  } else {
    // 灵活匹配 "批发8.5拉手", "47.5万拉手"
    const flexMatch1 = content.match(/(?:批发|一口价|明盘|底价|价格：|价格:)[：:\s]*([0-9\.]{1,5})/);
    const flexMatch2 = content.match(/([0-9\.]{1,5})\s*[万wW]?(?:拉手|包版|内出|拿|包过户)/);
    const flexMatch3 = content.match(/([0-9\.]{1,5})\s*[万wW](?!公里)/); // 最后的兜底
    
    if (flexMatch1) price = flexMatch1[1];
    else if (flexMatch2) price = flexMatch2[1];
    else if (flexMatch3) price = flexMatch3[1];
  }

  if (model && price) {
    // 3. 提取品牌分类
    const upperModel = model.toUpperCase();
    for (const b of commonBrands) {
      if (upperModel.includes(b)) {
        brand = b;
        break;
      }
    }
    
    // Normalize aliases
    if (["迈腾", "帕萨特", "途观"].includes(brand)) brand = "大众";
    if (["汉兰达", "塞纳", "埃尔法", "卡罗拉", "皇冠陆放", "普拉多"].includes(brand)) brand = "丰田";
    if (["雅阁", "思域"].includes(brand)) brand = "本田";
    if (["轩逸", "天籁"].includes(brand)) brand = "日产";
    
    if (!brand) brand = "未知品牌";
    
    return { brand, model, price };
  }
  return null;
}

const fileContent = fs.readFileSync('message.text', 'utf8');
// Deduplicate parsed json logic
const seenIds = new Set();
let count = 0;

function processObj(obj) {
  if (obj.category === 1 && obj.content && obj.msgId) {
    if (!seenIds.has(obj.msgId)) {
        seenIds.add(obj.msgId);
        const info = extractCarInfo(obj.content);
        if (info) {
          count++;
          if (count <= 10) {
             console.log(`[+] ID:${obj.msgId} Price:${info.price} Brand:${info.brand} Model:${info.model}`);
          }
        }
    }
  }
}

let lines = fileContent.split('\n');
let buffer = "";
for (let line of lines) {
  if (line.startsWith('{')) {
    if (buffer) {
       try { processObj(JSON.parse(buffer)); } catch(e){}
    }
    buffer = line;
  } else if (line.startsWith('}')) {
    buffer += '\n' + line;
    try { processObj(JSON.parse(buffer)); } catch(e){}
    buffer = "";
  } else if (buffer) {
    buffer += '\n' + line;
  }
}

console.log(`Total valid parsed messages: ${count}`);

