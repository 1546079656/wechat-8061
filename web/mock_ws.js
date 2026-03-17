const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

// 监听 3101 端口
const wss = new WebSocketServer({ port: 3101 });

// 获取本地的 message.text 文件路径
const msgFilePath = path.join(__dirname, 'message.text');

console.log("✅ WebSocket 服务端正在运行...");
console.log("👂 正在监听端口 3101...");

wss.on('connection', function connection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    console.log(`\n[新连接] 客户端已连接 IP: ${clientIp}`);

    // 定时器变量
    let intervalId;
    let pushIndex = 0;
    
    // 如果没有 message.text 文件，给个默认报错
    if (!fs.existsSync(msgFilePath)) {
        console.error("❌ 错误: 当前目录下找不到 message.text");
        ws.send("错误: 找不到 message.text");
        return;
    }

    // 立刻开始读取 message.text 并每一秒推送一行
    intervalId = setInterval(() => {
        // 读取并分割出行
        const data = fs.readFileSync(msgFilePath, 'utf-8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length > 0) {
            // 按行循环推送
            const msg = lines[pushIndex % lines.length];
            
            if (ws.readyState === 1) { // 检查连接是否还在打开状态
                ws.send(msg);
                console.log(`[推送成功] -> ${msg}`);
                pushIndex++;
            }
        }
    }, 1000);

    // 监听断开
    ws.on('close', () => {
        console.log(`[断开连接] 客户端 IP: ${clientIp} 已断开`);
        clearInterval(intervalId); // 停止该客户端的推送计时器
    });
    
    // 监听报错
    ws.on('error', (err) => {
        console.log(`[连接错误] `, err.message);
        clearInterval(intervalId);
    });
});
