(function () {
  "use strict";

  // --- Configuration ---
  const script = document.currentScript;
  const API_KEY = script.getAttribute("data-key");
  const API_URL =
    script.getAttribute("data-api") || "http://localhost:8000";
  const POSITION = script.getAttribute("data-position") || "bottom-right";
  const PRIMARY_COLOR = script.getAttribute("data-color") || "#2563eb";
  const HEADER_TEXT = script.getAttribute("data-header") || "Chat with us";

  if (!API_KEY) {
    console.error("[WonderChat] Missing data-key attribute on script tag.");
    return;
  }

  // --- Session ---
  let sessionId =
    sessionStorage.getItem("wc_session") || crypto.randomUUID();
  sessionStorage.setItem("wc_session", sessionId);

  let isOpen = false;
  let isLoading = false;

  // --- Shadow DOM Host ---
  const host = document.createElement("div");
  host.id = "wonderchat-host";
  const shadow = host.attachShadow({ mode: "closed" });

  // --- Styles ---
  const posLeft = POSITION === "bottom-left";
  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .wc-launcher {
      position: fixed;
      ${posLeft ? "left: 20px;" : "right: 20px;"}
      bottom: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${PRIMARY_COLOR};
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .wc-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }
    .wc-launcher svg { width: 28px; height: 28px; fill: #fff; }

    .wc-window {
      position: fixed;
      ${posLeft ? "left: 20px;" : "right: 20px;"}
      bottom: 90px;
      width: 380px;
      height: 540px;
      max-height: calc(100vh - 120px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: wc-slide-up 0.25s ease-out;
    }
    .wc-window.open { display: flex; }

    @keyframes wc-slide-up {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .wc-header {
      padding: 16px 20px;
      background: ${PRIMARY_COLOR};
      color: #fff;
      font-weight: 600;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .wc-header-close {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 20px;
      opacity: 0.8;
      padding: 0 4px;
    }
    .wc-header-close:hover { opacity: 1; }

    .wc-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      scroll-behavior: smooth;
    }
    .wc-messages::-webkit-scrollbar { width: 4px; }
    .wc-messages::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 4px;
    }

    .wc-msg {
      margin-bottom: 12px;
      padding: 10px 14px;
      border-radius: 14px;
      max-width: 85%;
      font-size: 14px;
      line-height: 1.55;
      word-wrap: break-word;
      animation: wc-fade-in 0.2s ease;
    }
    @keyframes wc-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .wc-msg.user {
      background: ${PRIMARY_COLOR};
      color: #fff;
      margin-left: auto;
      border-bottom-right-radius: 4px;
    }
    .wc-msg.bot {
      background: #f3f4f6;
      color: #1a1a1a;
      border-bottom-left-radius: 4px;
    }

    .wc-typing {
      display: flex;
      gap: 4px;
      padding: 12px 14px;
      align-items: center;
    }
    .wc-typing-dot {
      width: 8px;
      height: 8px;
      background: #9ca3af;
      border-radius: 50%;
      animation: wc-bounce 1.4s infinite ease-in-out both;
    }
    .wc-typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .wc-typing-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes wc-bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    .wc-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      background: #fff;
    }
    .wc-input {
      flex: 1;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .wc-input:focus { border-color: ${PRIMARY_COLOR}; }
    .wc-input::placeholder { color: #9ca3af; }

    .wc-send {
      background: ${PRIMARY_COLOR};
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 0 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .wc-send:hover { opacity: 0.9; }
    .wc-send:disabled { opacity: 0.5; cursor: not-allowed; }

    .wc-powered {
      text-align: center;
      padding: 6px;
      font-size: 11px;
      color: #9ca3af;
      background: #fafafa;
      flex-shrink: 0;
    }
    .wc-powered a { color: #6b7280; text-decoration: none; }

    @media (max-width: 440px) {
      .wc-window {
        width: calc(100vw - 16px);
        height: calc(100vh - 100px);
        ${posLeft ? "left: 8px;" : "right: 8px;"}
        bottom: 80px;
        border-radius: 12px;
      }
    }
  `;

  // --- Markup ---
  shadow.innerHTML = `
    <style>${styles}</style>
    <button class="wc-launcher" aria-label="Open chat">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
      </svg>
    </button>
    <div class="wc-window">
      <div class="wc-header">
        <span>${HEADER_TEXT}</span>
        <button class="wc-header-close" aria-label="Close chat">&times;</button>
      </div>
      <div class="wc-messages"></div>
      <div class="wc-input-area">
        <input class="wc-input" placeholder="Type a message..." maxlength="500" />
        <button class="wc-send">Send</button>
      </div>
      <div class="wc-powered">Powered by <a href="#">WonderChat</a></div>
    </div>
  `;

  document.body.appendChild(host);

  // --- DOM refs ---
  const launcher = shadow.querySelector(".wc-launcher");
  const chatWindow = shadow.querySelector(".wc-window");
  const closeBtn = shadow.querySelector(".wc-header-close");
  const input = shadow.querySelector(".wc-input");
  const sendBtn = shadow.querySelector(".wc-send");
  const messagesEl = shadow.querySelector(".wc-messages");

  // --- Interactions ---
  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.classList.toggle("open", isOpen);
    if (isOpen) {
      input.focus();
      // Show welcome message if first open
      if (messagesEl.children.length === 0) {
        appendMessage(
          "Hi! How can I help you today?",
          "bot"
        );
      }
    }
  }

  launcher.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click", toggleChat);

  function appendMessage(text, role) {
    const div = document.createElement("div");
    div.className = `wc-msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "wc-msg bot wc-typing";
    div.innerHTML =
      '<div class="wc-typing-dot"></div><div class="wc-typing-dot"></div><div class="wc-typing-dot"></div>';
    div.id = "wc-typing-indicator";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const el = shadow.getElementById("wc-typing-indicator");
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isLoading) return;

    appendMessage(text, "user");
    input.value = "";
    isLoading = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const resp = await fetch(`${API_URL}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
        },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
        }),
      });

      hideTyping();

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Request failed");
      }

      const data = await resp.json();
      appendMessage(data.reply, "bot");
    } catch (err) {
      hideTyping();
      appendMessage(
        "Sorry, I'm having trouble connecting. Please try again in a moment.",
        "bot"
      );
      console.error("[WonderChat]", err);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
