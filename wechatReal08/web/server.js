const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Keep track of stats for monitoring
let connections = 0;
let messagesSent = 0;
// Connected monitors (the HTML page)
let monitorClients = new Set();
// Connected 3101 clients
let wsClients = new Set();

// Serve the static files (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Monitor WebSocket on the same HTTP server (port 3000)
const monitorWss = new WebSocketServer({ server });

monitorWss.on('connection', (ws) => {
    monitorClients.add(ws);
    // Send initial state
    ws.send(JSON.stringify({ type: 'status', connections, messagesSent }));
    ws.on('close', () => monitorClients.delete(ws));
});

function broadcastMonitor(data) {
    for (const client of monitorClients) {
        if (client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify(data));
        }
    }
}

// Read message.text asynchronously
let messageLines = [];
const msgFilePath = path.join(__dirname, 'message.text');

function loadMessages() {
    try {
        if (!fs.existsSync(msgFilePath)) {
            // Create default file if not exists
            const defaultMsgs = ["这是第一条模拟推送的心跳数据", "这是第二条模拟推送的消息数据", "系统运行正常"];
            fs.writeFileSync(msgFilePath, defaultMsgs.join('\n'), 'utf-8');
            broadcastMonitor({ type: 'log', message: '未找到 message.text，已自动创建。' });
        }
        const data = fs.readFileSync(msgFilePath, 'utf-8');
        messageLines = data.split('\n').filter(line => line.trim() !== '');
        broadcastMonitor({ type: 'log', message: `加载 message.text 成功，共 ${messageLines.length} 条数据。` });
    } catch (err) {
        console.error("加载 message.text 失败", err);
    }
}

loadMessages();

// Watch file changes just in case
fs.watchFile(msgFilePath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        loadMessages();
    }
});

// Start the Mock WebSocket service on 3101
const mockWss = new WebSocketServer({ port: 3101 });

mockWss.on('listening', () => {
    console.log("Mock WebSocket service listening on port 3101");
    broadcastMonitor({ type: 'log', message: '模拟服务端已启动，监听 3101 端口' });
});

mockWss.on('connection', (ws, req) => {
    connections++;
    wsClients.add(ws);
    const clientIp = req.socket.remoteAddress;
    broadcastMonitor({ type: 'log', message: `新客户端已连接 (${clientIp})` });
    broadcastMonitor({ type: 'status', connections, messagesSent });

    let index = 0;
    
    // push a message every second
    const intervalId = setInterval(() => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            if (messageLines.length > 0) {
                const msg = messageLines[index % messageLines.length];
                ws.send(msg);
                messagesSent++;
                index++;
                broadcastMonitor({ type: 'log', message: `向 3101 客户端推送: ${msg}` });
                broadcastMonitor({ type: 'status', connections, messagesSent });
            }
        }
    }, 1000);

    ws.on('close', () => {
        clearInterval(intervalId);
        connections--;
        wsClients.delete(ws);
        broadcastMonitor({ type: 'log', message: `客户端断开连接 (${clientIp})` });
        broadcastMonitor({ type: 'status', connections, messagesSent });
    });
    
    ws.on('error', (error) => {
        clearInterval(intervalId);
        broadcastMonitor({ type: 'log', message: `客户端连接错误: ${error.message}` });
    });
});

const HTTP_PORT = 3000;
server.listen(HTTP_PORT, () => {
    console.log(`监控页面可通过浏览器访问: http://localhost:${HTTP_PORT}`);
});
