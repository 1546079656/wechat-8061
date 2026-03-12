document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const wsUrlInput = document.getElementById("ws-url");
  const connectBtn = document.getElementById("connect-btn");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const formatBtn = document.getElementById("format-btn");
  const searchInput = document.getElementById("search-input");
  const messageList = document.getElementById("message-list");
  const clearBtn = document.getElementById("clear-btn");
  const msgCountSpan = document.getElementById("msg-count");
  const autoScrollCheck = document.getElementById("auto-scroll");
  const toastContainer = document.getElementById("toast-container");

  let socket = null;
  let messageCount = 0;
  let allMessages = []; // Store all messages for searching

  // Update Status UI
  function updateStatus(state) {
    statusDot.className = "dot " + state;
    switch (state) {
      case "connected":
        statusText.innerText = "已连接";
        connectBtn.innerText = "断开";
        connectBtn.classList.remove("primary");
        connectBtn.classList.add("secondary");
        sendBtn.disabled = false;
        break;
      case "connecting":
        statusText.innerText = "连接中...";
        connectBtn.innerText = "取消";
        break;
      case "disconnected":
        statusText.innerText = "未连接";
        connectBtn.innerText = "连接";
        connectBtn.classList.add("primary");
        connectBtn.classList.remove("secondary");
        sendBtn.disabled = true;
        break;
    }
  }

  // Add Message to Log
  function addMessage(direction, content) {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;

    const msgObj = { direction, content, time: timeStr, visible: true };
    allMessages.push(msgObj);

    messageCount++;
    msgCountSpan.innerText = `${messageCount} 消息`;

    // If welcome message exists, clear it
    if (messageCount === 1) {
      messageList.innerHTML = "";
    }

    renderMessage(msgObj);
  }

  function renderMessage(msgObj) {
    const item = document.createElement("div");
    item.className = `message-item ${msgObj.direction}`;

    let displayContent = msgObj.content;
    let typeTag = "";
    let richHeader = "";

    try {
      const parsed = JSON.parse(msgObj.content);
      displayContent = JSON.stringify(parsed, null, 2);
      typeTag = '<span class="msg-tag">JSON</span>';

      // WeChat Message Category Detection
      if (parsed.category) {
        const catMap = {
          1: { label: "文本", icon: "📝" },
          3: { label: "图片", icon: "🖼️" },
          34: { label: "语音", icon: "🎤" },
          43: { label: "视频", icon: "📹" },
          47: { label: "表情", icon: "🤡" },
          48: { label: "位置", icon: "📍" },
          49: { label: "卡片/文件", icon: "🔗" },
          10000: { label: "系统", icon: "⚙️" },
        };
        const info = catMap[parsed.category];
        if (info) {
          richHeader = `<div class="msg-rich-header">${info.icon} ${info.label}消息</div>`;
        }
      }

      // If content inside JSON is XML, format it
      if (parsed.content && typeof parsed.content === "string" && parsed.content.includes("<?xml")) {
        // We keep the JSON display but we can hint that it contains XML
      }
    } catch (e) {
      if (msgObj.content.trim().startsWith("<")) {
        typeTag = '<span class="msg-tag">XML</span>';
        displayContent = formatXml(msgObj.content);
      }
    }

    item.innerHTML = `
            <div class="message-meta">
                <span class="msg-direction dir-${msgObj.direction}">${msgObj.direction === "in" ? "收到" : msgObj.direction === "out" ? "发出" : "系统"}</span>
                <span class="msg-time">${msgObj.time}</span>
                ${typeTag}
            </div>
            ${richHeader}
            <pre class="msg-content">${escapeHtml(displayContent)}</pre>
        `;

    messageList.appendChild(item);

    if (autoScrollCheck.checked) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  // Simple XML Formatter
  function formatXml(xml) {
    let formatted = "";
    let indent = "";
    const tab = "  ";
    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
      formatted += indent + "<" + node + ">\r\n";
      if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab;
    });
    return formatted.substring(1, formatted.length - 3);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // WebSocket Logic
  function toggleConnection() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
      return;
    }

    const url = wsUrlInput.value.trim();
    if (!url) {
      showToast("请输入有效的 WebSocket 地址");
      return;
    }

    try {
      updateStatus("connecting");
      socket = new WebSocket(url);

      socket.onopen = () => {
        updateStatus("connected");
        addMessage("sys", `成功连接到 ${url}`);
        showToast("连接成功");
      };

      socket.onmessage = (event) => {
        addMessage("in", event.data);
      };

      socket.onclose = (event) => {
        updateStatus("disconnected");
        addMessage("sys", `连接已断开 (原因: ${event.code})`);
        socket = null;
      };

      socket.onerror = (error) => {
        showToast("连接发生错误");
        console.error(error);
      };
    } catch (e) {
      updateStatus("disconnected");
      showToast("无效的连接地址");
      console.error(e);
    }
  }

  function sendMessage() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const content = messageInput.value;
    if (!content) return;

    socket.send(content);
    addMessage("out", content);
    messageInput.value = "";
  }

  // Helpers
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatJson() {
    const content = messageInput.value;
    try {
      const parsed = JSON.parse(content);
      messageInput.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
      showToast("内容不是有效的 JSON");
    }
  }

  function handleSearch() {
    const term = searchInput.value.toLowerCase();
    messageList.innerHTML = "";

    const filtered = allMessages.filter(
      (msg) =>
        msg.content.toLowerCase().includes(term) ||
        msg.direction.toLowerCase().includes(term),
    );

    if (filtered.length === 0 && term) {
      messageList.innerHTML = '<div class="welcome-msg">未找到匹配消息</div>';
    } else {
      filtered.forEach((msg) => renderMessage(msg));
    }
  }

  // Event Listeners
  connectBtn.addEventListener("click", toggleConnection);
  sendBtn.addEventListener("click", sendMessage);
  formatBtn.addEventListener("click", formatJson);
  clearBtn.addEventListener("click", () => {
    messageList.innerHTML = '<div class="welcome-msg">日志已清空</div>';
    allMessages = [];
    messageCount = 0;
    msgCountSpan.innerText = "0 消息";
  });

  searchInput.addEventListener("input", handleSearch);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      sendMessage();
    }
  });

  wsUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      toggleConnection();
    }
  });
});
