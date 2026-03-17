const fs = require('fs');

// ==== 1. 配置汽车品牌字典 ====
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

// ==== 2. 提取信息的核心方法 ====
function extractCarInfo(content) {
  let model = "";
  let price = "";
  let brand = "";

  // A. 尝试使用结构化的模板提取型号和价格
  const regexModel = /【(?:车辆(?:型号|款型|款式)|品牌车系)[】:：\s]*([^\n【]+)/;
  const regexPrice = /(?:批发价?|一口价|【?批发价】?|车辆价格|【?新车(?:指导)?价(?:格)?】?|底价|明盘|全款|便宜|拉手)[】:：\s]*([0-9\.]+)(?!万公里)/i;

  const structModelMatch = content.match(regexModel);
  const structPriceMatch = content.match(regexPrice);

  if (structModelMatch) model = structModelMatch[1].trim();
  if (structPriceMatch) price = structPriceMatch[1].trim();

  // B. 兜底匹配：纯文本消息 (非模板类型) -> 比如 "17年奔驰C200运动版... 批发8.5拉手"
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
     // 灵活匹配类似 "批发8.5拉手" 或 "47.5万拉手"
     const flexMatch1 = content.match(/(?:批发|一口价|明盘|底价|价格：|价格:|全款|便宜|带走|拉手)[：:\s]*([0-9\.]{1,5})/i);
     const flexMatch2 = content.match(/([0-9\.]{1,5})\s*[万wW]?(?:拉手|包版|内出|拿|包过户|秒拿|带走)/i);
     const flexMatch3 = content.match(/([0-9\.]{1,5})\s*[万wW万wW](?!公里)/i);
     
     if (flexMatch1 && flexMatch1[1] !== '0') price = flexMatch1[1];
     else if (flexMatch2 && flexMatch2[1] !== '0') price = flexMatch2[1];
     else if (flexMatch3 && flexMatch3[1] !== '0') price = flexMatch3[1];
  }

  // C. 只要能够提取出型号和价格，我们就认为是一条有效卖车信息
  if (model && price) {
    const upperContent = content.toUpperCase();
    let detectedBrand = "";
    
    // 判断内容中包含哪些常见品牌关键字
    for (const b of commonBrands) {
      if (upperContent.includes(b.toUpperCase())) {
        detectedBrand = b;
        break;
      }
    }
    
    // 特殊别名归一化处理
    if (["迈腾", "帕萨特", "途观"].includes(detectedBrand)) detectedBrand = "大众";
    if (["汉兰达", "塞纳", "埃尔法", "卡罗拉", "皇冠陆放", "普拉多"].includes(detectedBrand)) detectedBrand = "丰田";
    if (["雅阁", "思域"].includes(detectedBrand)) detectedBrand = "本田";
    if (["轩逸", "天籁"].includes(detectedBrand)) detectedBrand = "日产";
    
    brand = detectedBrand || "未知品牌";
    return { brand, model, price };
  }
  
  return null;
}

// ==== 3. 执行解析和数据分流 ====
function processFile() {
  const fileContent = fs.readFileSync('/Users/yang/projects/微信协议(2)/861ws--08/web/message.text', 'utf8');
  const lines = fileContent.split('\n');

  // 由于原始日志中包含了单行的 JSON 与 跨多行的 "📝 文本消息" JSON 打印
  // 并且有时消息会存在重复输出，因此需要去重 (msgId)
  const seenIds = new Set();
  
  let inMulti = false;
  let buffer = "";

  const withPhoneList = [];
  const withoutPhoneList = [];
  const regexPhone = /(?:^|[^0-9])(1[3-9][0-9\- \s]{9,13})(?:$|[^0-9])/g;

  // 处理每个完整的 JSON 对象
  function processObj(msg) {
    // 仅处理真实的文本消息 (category: 1)
    if (msg && msg.msgId && msg.category === 1 && msg.content) {
      // 过滤掉冗余过短或者是无关聊天的内容
      if (msg.content.length < 15 && !brandRegex.test(msg.content)) return;
      
      // 根据 msgId 严格去重 (解决重复打印导致的数据虚高问题)
      if (!seenIds.has(msg.msgId)) {
        seenIds.add(msg.msgId);
        
        const info = extractCarInfo(msg.content);
        if (info) {
          const content = msg.content;
          let foundPhone = null;
          let match;
          regexPhone.lastIndex = 0; 
          
          while ((match = regexPhone.exec(content)) !== null) {
            let cleanPhone = match[1].replace(/[\-\s]/g, '');
            if (cleanPhone.length === 11 && /^\d{11}$/.test(cleanPhone)) {
              foundPhone = cleanPhone;
              break; 
            }
          }

          const carData = {
            brand: info.brand,
            model: info.model,
            price: info.price,
            sender: msg.sender?.nickname || '未知用户',
            timestamp: msg.timestamp,
            content: content,
          };

          if (foundPhone) {
            carData.phone = foundPhone;
            withPhoneList.push(carData);
          } else {
            withoutPhoneList.push(carData);
          }
        }
      }
    }
  }

  // 逐行解析，兼容单行 JSON 和多行 Pretty JSON
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

  // ==== 4. 输出分类统计结果 ====
  console.log('================ 解析完成 (v2 升级去重版) ================');
  console.log('**更新说明**: 包含了对跨行文本(📝 文本消息)的识别，增加了msgId去重，并以content为唯一准则智能提取');
  console.log(`符合条件(含品牌型号&价格)的车辆消息共提取: ${withPhoneList.length + withoutPhoneList.length} 条 \n`);
  console.log(`✅ [分类1: 有11位手机号的记录]: ${withPhoneList.length} 条`);
  console.log(`❌ [分类2: 没11位手机号的记录]: ${withoutPhoneList.length} 条`);
  console.log('========================================================');

  // ==== 5. 存储到独立 JSON 文件 ====
  fs.writeFileSync('/Users/yang/projects/微信协议(2)/861ws--08/web/cars_with_phone.json', JSON.stringify(withPhoneList, null, 2));
  fs.writeFileSync('/Users/yang/projects/微信协议(2)/861ws--08/web/cars_without_phone.json', JSON.stringify(withoutPhoneList, null, 2));
  
  console.log('数据已更新并保存完成:');
  console.log('📁 ./cars_with_phone.json');
  console.log('📁 ./cars_without_phone.json');
}

processFile();
