document.addEventListener("DOMContentLoaded", () => {
    const apiKeyInput = document.getElementById("api-key-input");
    const modelInput = document.getElementById("model-input");
    const chatMessages = document.getElementById("chat-messages");
    const chatTextarea = document.getElementById("chat-textarea");
    const sendBtn = document.getElementById("send-btn");
    const clearBtn = document.getElementById("clear-chat");

    const BASE_URL = "https://fucaixie.xyz/v1";

    // Load saved settings
    const savedKey = localStorage.getItem("fufu_api_key");
    if (savedKey) apiKeyInput.value = savedKey;

    const savedModel = localStorage.getItem("fufu_model");
    if (savedModel) modelInput.value = savedModel;

    // Save settings on change
    apiKeyInput.addEventListener("change", () => {
        localStorage.setItem("fufu_api_key", apiKeyInput.value.trim());
    });

    modelInput.addEventListener("change", () => {
        localStorage.setItem("fufu_model", modelInput.value.trim());
    });

    // Auto-resize textarea
    chatTextarea.addEventListener("input", () => {
        chatTextarea.style.height = "auto";
        chatTextarea.style.height = chatTextarea.scrollHeight + "px";
    });

    // Clear chat
    clearBtn.addEventListener("click", () => {
        chatMessages.innerHTML = "";
        addMessage("ai", "对话已清空。");
    });

    // Add message to UI
    function addMessage(role, content) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${role}`;
        
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.textContent = content;

        const meta = document.createElement("div");
        meta.className = "message-meta";
        meta.textContent = new Date().toLocaleTimeString();

        msgDiv.appendChild(bubble);
        msgDiv.appendChild(meta);
        chatMessages.appendChild(msgDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return bubble;
    }

    async function handleSend() {
        const content = chatTextarea.value.trim();
        const apiKey = apiKeyInput.value.trim();
        const model = modelInput.value.trim();

        if (!content) return;
        if (!apiKey) {
            alert("请输入 API Key");
            return;
        }

        // Add user message
        addMessage("user", content);
        chatTextarea.value = "";
        chatTextarea.style.height = "auto";
        
        // Disable state
        sendBtn.disabled = true;
        const aiBubble = addMessage("ai", "...");
        let fullResponse = "";

        try {
            const response = await fetch(`${BASE_URL}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: content }],
                    stream: true,
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            // Handle Stream with Buffer
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            aiBubble.textContent = ""; 

            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep the last partial line in buffer

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
                    
                    const dataStr = trimmedLine.slice(6).trim();
                    if (dataStr === "[DONE]") break;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices[0].delta?.content || "";
                        if (delta) {
                            fullResponse += delta;
                            aiBubble.textContent = fullResponse;
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                    } catch (e) {
                        console.warn("Skipping partial or invalid JSON line:", line);
                    }
                }
            }
        } catch (error) {
            console.error("Chat API Error:", error);
            aiBubble.textContent = `发送失败: ${error.message}`;
            aiBubble.style.color = "var(--error)";
            
            if (error.message.includes("401")) {
                aiBubble.textContent += " (请检查 API Key 是否正确)";
            } else if (error.message.includes("404")) {
                aiBubble.textContent += " (模型名称可能不正确或 API 地址有误)";
            } else if (error.name === "TypeError" && error.message.includes("fetch")) {
                aiBubble.textContent += " (网络连接失败或存在跨域 CORS 限制)";
            }
        } finally {
            sendBtn.disabled = false;
        }
    }

    sendBtn.addEventListener("click", handleSend);
    chatTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            handleSend();
        }
    });
});
