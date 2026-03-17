const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Automatically open the browser
async function openBrowser(url) {
    const open = (await import('open')).default;
    open(url);
}

const app = express();
const server = http.createServer(app);

// Serve the single HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'auto_run.html'));
});

// Create WebSocket server for the control panel (monitor)
const monitorWss = new WebSocketServer({ noServer: true });
let monitorClients = new Set();
let pushRate = 1; // global push rate (times per second), default is 1

// Start the 3101 Mock Server
const mockWss = new WebSocketServer({ port: 3101, path: '/socket' });
const mockClients = new Set();
const msgFilePath = path.join(__dirname, 'message.text');

function broadcastMonitor(data) {
    for (const client of monitorClients) {
        if (client.readyState === 1) { // OPEN
            client.send(JSON.stringify(data));
        }
    }
}

// 核心推流函数：接收一个客户端ws对象并维持其专门的发包定时器
function startPushingForClient(ws) {
    // 如果已经有定时器，先清除保证不会多发
    if (ws.intervalId) {
        clearInterval(ws.intervalId);
    }
    
    // 计算执行频率（防极值：最高 100 次每秒，每 10ms 执行一次）
    const targetIntervalMs = Math.max(10, Math.floor(1000 / pushRate));
    
    ws.intervalId = setInterval(() => {
        if (ws.readyState === 1) { // 检查连接存活
            try {
                if (fs.existsSync(msgFilePath)) {
                    const data = fs.readFileSync(msgFilePath, 'utf-8');
                    const lines = data.split('\n').filter(line => line.trim() !== '');
                    if (lines.length > 0) {
                        if (ws.msgIndex < lines.length) {
                            const msg = lines[ws.msgIndex];
                            ws.send(msg);
                            broadcastMonitor({ type: 'push', msg: msg });
                            ws.msgIndex++; // 发送成功后偏移游标
                        } else {
                            // 跑完全部数据，停止推流，不再循环
                            clearInterval(ws.intervalId);
                            broadcastMonitor({ type: 'log', msg: `✅ 已推流完毕所有数据 (共 ${lines.length} 条)` });
                        }
                    }
                } else {
                    broadcastMonitor({ type: 'error', msg: '警告: 找不到 message.text 文件' });
                }
            } catch (err) {
                 broadcastMonitor({ type: 'error', msg: `读取错误: ${err.message}` });
            }
        } else {
            // 如果连接死了直接清掉
            clearInterval(ws.intervalId);
        }
    }, targetIntervalMs);
}


monitorWss.on('connection', ws => {
    monitorClients.add(ws);
    
    // 发送当前配置给前端
    ws.send(JSON.stringify({ type: 'config', pushRate }));
    
    // 监听前端传来的调整频率配置
    ws.on('message', msg => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'setRate') {
                const newRate = parseInt(data.rate);
                if (newRate > 0) {
                    pushRate = newRate;
                    broadcastMonitor({ type: 'log', msg: `⚙️ 收到控制台指令：推流速率已更改为 ${pushRate} 次/秒` });
                    // 让所有现有的连接热重载这个频率
                    for (const mWs of mockClients) {
                        startPushingForClient(mWs);
                    }
                }
            } else if (data.type === 'pushAgain') {
                broadcastMonitor({ type: 'log', msg: `🔄 收到控制台指令：正在为所有已连接上的客户端重新开始推送数据！` });
                for (const mWs of mockClients) {
                    mWs.msgIndex = 0; // 重置游标
                    startPushingForClient(mWs); // 重新开启定时发包
                }
            }
        } catch(e) {}
    });
    
    ws.on('close', () => monitorClients.delete(ws));
});

// Upgrade HTTP to WS for the monitor
server.on('upgrade', (request, socket, head) => {
    if (request.url === '/_monitor') {
        monitorWss.handleUpgrade(request, socket, head, ws => {
            monitorWss.emit('connection', ws, request);
        });
    }
});

// START THE 3101 MOCK SERVICE
mockWss.on('listening', () => {
    console.log("-> 3101 Mock Server Listening");
    broadcastMonitor({ type: 'log', msg: '✅ 3101端 Socket 服务已启动并监听' });
});

mockWss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    broadcastMonitor({ type: 'log', msg: `👤 新客户端已连接 [IP: ${clientIp}]` });
    
    mockClients.add(ws);
    ws.msgIndex = 0; // 为每个客户端保持自己拉包的index游标进度

    // 开始推送
    startPushingForClient(ws);

    ws.on('close', () => {
        if (ws.intervalId) clearInterval(ws.intervalId);
        mockClients.delete(ws);
        broadcastMonitor({ type: 'log', msg: `❌ 客户端已断开连接 [IP: ${clientIp}]` });
    });
    
    ws.on('error', (err) => {
        if (ws.intervalId) clearInterval(ws.intervalId);
        mockClients.delete(ws);
        broadcastMonitor({ type: 'error', msg: `客户端连接错误: ${err.message}` });
    });
});

mockWss.on('error', (err) => {
     console.error("Mock Server Error:", err);
     broadcastMonitor({ type: 'error', msg: `服务端端口被占用或发生错误: ${err.message}` });
});

// Start Web Server and auto open browser
const WEB_PORT = 3000;
server.listen(WEB_PORT, () => {
    console.log(`Web Control Panel is running on http://localhost:${WEB_PORT}`);
    openBrowser(`http://localhost:${WEB_PORT}`);
});
