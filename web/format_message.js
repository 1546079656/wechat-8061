const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'message.text');

function formatFile() {
    console.log('正在读取 message.text ...');
    const input = fs.readFileSync(filePath, 'utf8');
    let outputLines = [];
    
    let i = 0;
    while (i < input.length) {
        // 跳过前面的空白字符和换行
        while (i < input.length && /\s/.test(input[i]) && input[i] !== '\n') {
            i++;
        }
        if (i >= input.length) break;

        // 如果是个可能的 JSON 对象开头
        if (input[i] === '{') {
            let start = i;
            let depth = 0;
            let inString = false;
            let escape = false;
            let found = false;

            for (let j = i; j < input.length; j++) {
                let c = input[j];
                if (!inString) {
                    if (c === '{') depth++;
                    else if (c === '}') {
                        depth--;
                        if (depth === 0) {
                            let jsonStr = input.substring(start, j + 1);
                            try {
                                let obj = JSON.parse(jsonStr);
                                // 压缩为单行
                                outputLines.push(JSON.stringify(obj));
                                i = j + 1;
                                found = true;
                                break;
                            } catch (e) {
                                // 就算大括号闭合，也不是合法JSON，继续找下一个换行继续降级处理
                            }
                        }
                    } else if (c === '"') {
                        inString = true;
                    }
                } else {
                    if (escape) {
                        escape = false;
                    } else {
                        if (c === '\\') escape = true;
                        else if (c === '"') inString = false;
                    }
                }
            }
            
            if (!found) {
                // 读取普通的一行
                let nextNewline = input.indexOf('\n', i);
                if (nextNewline === -1) nextNewline = input.length;
                let line = input.substring(i, nextNewline).trim();
                if (line) outputLines.push(line);
                i = nextNewline + 1;
            }
        } else {
            // 普通文本，直接当做单行
            let nextNewline = input.indexOf('\n', i);
            if (nextNewline === -1) nextNewline = input.length;
            let line = input.substring(i, nextNewline).trim();
            if (line) outputLines.push(line);
            i = nextNewline + 1;
        }
    }

    fs.writeFileSync(filePath, outputLines.join('\n'));
    console.log(`✅ 格式化完成！共提取并压缩了 ${outputLines.length} 条数据。`);
}

formatFile();
