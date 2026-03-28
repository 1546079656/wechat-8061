package com.dz.config;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MyWebSocketHandler extends TextWebSocketHandler {

    // ✅ 并发安全的 Session 字典：wxid -> WebSocketSession
    public static final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // 从 URI 中提取 wxid (路径格式: /ws/{wxid})
        String uri = session.getUri().toString();
        String wxid = uri.substring(uri.lastIndexOf("/") + 1);

        // ✅ 关键修复：如果同一个 wxid 已经有旧连接，先安全关闭旧的，再绑新的
        WebSocketSession oldSession = sessions.get(wxid);
        if (oldSession != null && oldSession.isOpen()) {
            try {
                oldSession.close(CloseStatus.NORMAL);
            } catch (Exception ignored) {
            }
        }

        sessions.put(wxid, session);
        sendMessage(wxid, wxid + "已连接");
        System.out.println("New connection established for wxid: " + wxid);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = (String) message.getPayload();
        System.out.println("Received message: " + payload);
        session.sendMessage(new TextMessage("Echo: " + payload));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String uri = session.getUri().toString();
        String wxid = uri.substring(uri.lastIndexOf("/") + 1);

        // ✅ 关键修复：只有当 Map 中存的 session 和当前关闭的 session 是同一个时才移除
        // 防止新连接刚绑定进去就被旧连接的关闭回调给误删了
        WebSocketSession current = sessions.get(wxid);
        if (current != null && current == session) {
            sessions.remove(wxid);
            System.out.println("Connection closed for wxid: " + wxid);
        }

        sendMessage(wxid, wxid + "已关闭连接");
    }

    /**
     * ✅ 顶级稳定性的推送方法：
     * 1. 线程安全 - 使用 synchronized 保护每个 session 的发送操作
     * 2. 异常隔离 - 单个 session 的异常不影响其他号
     * 3. 自动清理 - 发送失败时自动移除死连接
     */
    public static void sendMessage(String wxid, String message) throws IOException {
        WebSocketSession session = sessions.get(wxid);
        if (session != null && session.isOpen()) {
            try {
                // ✅ 关键修复：对单个 session 加锁，防止并发写入导致帧错乱
                synchronized (session) {
                    session.sendMessage(new TextMessage(message));
                }
            } catch (IOException e) {
                System.err.println("❌ Send failed for wxid: " + wxid + ", removing dead session. Error: " + e.getMessage());
                sessions.remove(wxid);
                try { session.close(); } catch (Exception ignored) {}
            }
        } else {
            System.err.println("No active session found for wxid: " + wxid);
        }
    }
}
