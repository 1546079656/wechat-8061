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

  const regexModel = /【(?:车辆型号|车辆款型|车辆款式|品牌车系)[】:：\s]*([^\n]+)/;
  const regexPrice = /(?:批发价?|一口价|【?批发价】?|车辆价格|【?新车(?:指导)?价(?:格)?】?|底价|明盘|全款|便宜)[】:：\s]*([0-9\.]+)(?!万公里)/i;

  const structModelMatch = content.match(regexModel);
  const structPriceMatch = content.match(regexPrice);

  if (structModelMatch) model = structModelMatch[1].trim();
  if (structPriceMatch) price = structPriceMatch[1].trim();

  // Fallback pattern matching
  if (!model) {
     const lines = content.split('\n');
     for (let line of lines) {
        if (brandRegex.test(line) && line.trim().length > 3 && line.trim().length < 60) {
           model = line.trim().replace(/^wxid_[A-Za-z0-9]+:\s*/, '').trim();
           break;
        }
     }
  }

  if (!price || isNaN(parseFloat(price))) {
     const flexMatch1 = content.match(/(?:批发|一口价|明盘|底价|价格：|价格:|全款|便宜|带走|拉手)[：:\s]*([0-9\.]{1,5})/i);
     const flexMatch2 = content.match(/([0-9\.]{1,5})\s*[万wW]?(?:拉手|包版|内出|拿|包过户|秒拿|带走)/i);
     const flexMatch3 = content.match(/([0-9\.]{1,5})\s*[万wW万wW](?!公里)/i);
     
     if (flexMatch1 && flexMatch1[1] !== '0') price = flexMatch1[1];
     else if (flexMatch2 && flexMatch2[1] !== '0') price = flexMatch2[1];
     else if (flexMatch3 && flexMatch3[1] !== '0') price = flexMatch3[1];
  }

  if (model && price) {
    const upperContent = content.toUpperCase();
    let detectedBrand = "";
    for (const b of commonBrands) {
      if (upperContent.includes(b.toUpperCase())) {
        detectedBrand = b;
        break;
      }
    }
    
    // Normalize aliases
    if (["迈腾", "帕萨特", "途观"].includes(detectedBrand)) detectedBrand = "大众";
    if (["汉兰达", "塞纳", "埃尔法", "卡罗拉", "皇冠陆放", "普拉多"].includes(detectedBrand)) detectedBrand = "丰田";
    if (["雅阁", "思域"].includes(detectedBrand)) detectedBrand = "本田";
    if (["轩逸", "天籁"].includes(detectedBrand)) detectedBrand = "日产";
    
    brand = detectedBrand || "未知品牌";
    return { brand, model, price };
  }
  
  return null;
}

const fileContent = fs.readFileSync('message.text', 'utf8');
const lines = fileContent.split('\n');

let seenIds = new Set();
let inMulti = false;
let buffer = "";

let matchedCount = 0;
let textMessages = [];

function processObj(obj) {
  if (obj && obj.msgId && obj.category === 1 && obj.content) {
    // 过滤掉只有几个字的短消息或者是系统消息的冗余
    if (obj.content.length < 15 && !brandRegex.test(obj.content)) return;
    
    if (!seenIds.has(obj.msgId)) {
      seenIds.add(obj.msgId);
      textMessages.push(obj);
      
      const info = extractCarInfo(obj.content);
      if (info) {
          matchedCount++;
          // console.log(`[OK] Price: ${info.price}, Brand: ${info.brand}, Model: ${info.model.substring(0,25)}`);
      } else {
          // console.log(`[Unmatched] ${obj.content.replace(/\n/g, '\\n').substring(0, 150)}`);
      }
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

console.log(`Unique category 1 msgs (length > 15): ${textMessages.length}`);
console.log(`Successfully extracted car info: ${matchedCount}`);
