(function () {
  "use strict";

  // --- Read script tag attributes ---
  const script = document.currentScript;
  const API_KEY = script.getAttribute("data-key");
  const API_URL = script.getAttribute("data-api") || "http://localhost:8000";

  if (!API_KEY) {
    console.error("[WonderChat] Missing data-key attribute.");
    return;
  }

  // --- State ---
  let isOpen = false;
  let isLoading = false;
  let config = null; // fetched from backend
  let sessionId = null;
  let shadow = null;

  // --- Default config (used until backend responds) ---
  const DEFAULTS = {
    primary_color: "#2563eb",
    accent_color: "#1e40af",
    background_color: "#ffffff",
    text_color: "#1a1a1a",
    font_family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    border_radius: "large",
    theme: "light",
    position: "bottom-right",
    launcher_icon: "chat",
    launcher_icon_url: null,
    launcher_size: 60,
    window_width: 380,
    window_height: 540,
    bot_name: "Assistant",
    bot_avatar_url: null,
    header_text: "Chat with us",
    welcome_message: "Hi! How can I help you today?",
    placeholder_text: "Type a message...",
    show_powered_by: true,
    auto_open: false,
    auto_open_delay_ms: 3000,
    persist_conversations: true,
    show_sources: false,
    max_message_length: 500,
    tenant_name: "",
  };

  // --- Session management ---
  function getSessionId() {
    const key = "wc_session_" + API_KEY.slice(0, 12);
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  // --- Conversation persistence ---
  function getStorageKey() {
    return "wc_messages_" + API_KEY.slice(0, 12) + "_" + sessionId;
  }

  function saveMessages(messages) {
    if (!config || !config.persist_conversations) return;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(messages));
    } catch (e) { /* storage full, ignore */ }
  }

  function loadMessages() {
    if (!config || !config.persist_conversations) return [];
    try {
      const raw = localStorage.getItem(getStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // --- Theme detection ---
  function resolveTheme(themeSetting) {
    if (themeSetting === "auto") {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      const body = document.body;
      const bg = window.getComputedStyle(body).backgroundColor;
      if (bg) {
        const match = bg.match(/\d+/g);
        if (match && match.length >= 3) {
          const brightness = (parseInt(match[0]) * 299 + parseInt(match[1]) * 587 + parseInt(match[2]) * 114) / 1000;
          return brightness < 128 ? "dark" : "light";
        }
      }
      return "light";
    }
    return themeSetting;
  }

  // --- Launcher icon SVGs ---
  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>',
    question: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>',
    support: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>',
  };

  // --- Border radius map ---
  const RADIUS_MAP = { none: "0", small: "8px", medium: "12px", large: "16px" };

  // --- Build the widget ---
  function buildWidget(cfg) {
    config = cfg;
    sessionId = getSessionId();
    const theme = resolveTheme(cfg.theme);
    const isDark = theme === "dark";
    const posLeft = cfg.position.includes("left");
    const posTop = cfg.position.includes("top");
    const radius = RADIUS_MAP[cfg.border_radius] || "16px";

    // Dark theme overrides
    const bgColor = isDark ? "#1f2937" : cfg.background_color;
    const textColor = isDark ? "#e5e7eb" : cfg.text_color;
    const inputBg = isDark ? "#374151" : "#ffffff";
    const inputBorder = isDark ? "#4b5563" : "#d1d5db";
    const botMsgBg = isDark ? "#374151" : "#f3f4f6";
    const botMsgColor = isDark ? "#e5e7eb" : "#1a1a1a";
    const poweredBg = isDark ? "#111827" : "#fafafa";

    // Launcher icon
    let launcherContent;
    if (cfg.launcher_icon === "custom" && cfg.launcher_icon_url) {
      launcherContent = '<img class="wc-launcher-img" src="' + cfg.launcher_icon_url + '" alt="Chat" />';
    } else {
      launcherContent = ICONS[cfg.launcher_icon] || ICONS.chat;
    }

    // Bot avatar
    let avatarHtml = "";
    if (cfg.bot_avatar_url) {
      avatarHtml = '<img class="wc-avatar" src="' + cfg.bot_avatar_url + '" alt="' + cfg.bot_name + '" />';
    }

    // --- Shadow DOM ---
    const host = document.createElement("div");
    host.id = "wonderchat-host";
    shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .wc-launcher {
          position: fixed;
          ${posLeft ? "left: 20px;" : "right: 20px;"}
          ${posTop ? "top: 20px;" : "bottom: 20px;"}
          width: ${cfg.launcher_size}px;
          height: ${cfg.launcher_size}px;
          border-radius: 50%;
          background: ${cfg.primary_color};
          color: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          padding: 0;
        }
        .wc-launcher:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }
        .wc-launcher svg { width: ${Math.round(cfg.launcher_size * 0.47)}px; height: ${Math.round(cfg.launcher_size * 0.47)}px; fill: #fff; }
        .wc-launcher-img { width: ${Math.round(cfg.launcher_size * 0.6)}px; height: ${Math.round(cfg.launcher_size * 0.6)}px; border-radius: 50%; object-fit: cover; }

        .wc-window {
          position: fixed;
          ${posLeft ? "left: 20px;" : "right: 20px;"}
          ${posTop ? "top: " + (cfg.launcher_size + 30) + "px;" : "bottom: " + (cfg.launcher_size + 30) + "px;"}
          width: ${cfg.window_width}px;
          height: ${cfg.window_height}px;
          max-height: calc(100vh - ${cfg.launcher_size + 50}px);
          background: ${bgColor};
          border-radius: ${radius};
          box-shadow: 0 8px 40px rgba(0, 0, 0, ${isDark ? "0.4" : "0.15"});
          display: none;
          flex-direction: column;
          overflow: hidden;
          z-index: 2147483647;
          font-family: ${cfg.font_family};
          color: ${textColor};
          animation: wc-slide-in 0.25s ease-out;
        }
        .wc-window.open { display: flex; }

        @keyframes wc-slide-in {
          from { opacity: 0; transform: translateY(${posTop ? "-10px" : "10px"}); }
          to { opacity: 1; transform: translateY(0); }
        }

        .wc-header {
          padding: 16px 20px;
          background: ${cfg.primary_color};
          color: #fff;
          font-weight: 600;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-shrink: 0;
        }
        .wc-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .wc-header-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,255,255,0.3);
        }
        .wc-header-close {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          font-size: 22px;
          opacity: 0.8;
          padding: 0 4px;
          line-height: 1;
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
          background: ${isDark ? "#4b5563" : "#d1d5db"};
          border-radius: 4px;
        }

        .wc-msg-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          margin-bottom: 12px;
          animation: wc-fade-in 0.2s ease;
        }
        .wc-msg-row.user { flex-direction: row-reverse; }

        @keyframes wc-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .wc-msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .wc-msg {
          padding: 10px 14px;
          border-radius: 14px;
          max-width: 80%;
          font-size: 14px;
          line-height: 1.55;
          word-wrap: break-word;
        }
        .wc-msg.user {
          background: ${cfg.primary_color};
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .wc-msg.bot {
          background: ${botMsgBg};
          color: ${botMsgColor};
          border-bottom-left-radius: 4px;
        }

        .wc-sources {
          margin-top: 4px;
          font-size: 11px;
          color: ${isDark ? "#9ca3af" : "#6b7280"};
        }
        .wc-sources a {
          color: ${cfg.accent_color};
          text-decoration: none;
        }
        .wc-sources a:hover { text-decoration: underline; }

        .wc-typing {
          display: flex;
          gap: 4px;
          padding: 12px 14px;
          align-items: center;
        }
        .wc-typing-dot {
          width: 8px;
          height: 8px;
          background: ${isDark ? "#6b7280" : "#9ca3af"};
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
          border-top: 1px solid ${inputBorder};
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          background: ${bgColor};
        }
        .wc-input {
          flex: 1;
          border: 1px solid ${inputBorder};
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 14px;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s;
          background: ${inputBg};
          color: ${textColor};
        }
        .wc-input:focus { border-color: ${cfg.primary_color}; }
        .wc-input::placeholder { color: ${isDark ? "#6b7280" : "#9ca3af"}; }

        .wc-send {
          background: ${cfg.primary_color};
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
          color: ${isDark ? "#6b7280" : "#9ca3af"};
          background: ${poweredBg};
          flex-shrink: 0;
        }
        .wc-powered a { color: ${isDark ? "#9ca3af" : "#6b7280"}; text-decoration: none; }

        @media (max-width: 440px) {
          .wc-window {
            width: calc(100vw - 16px);
            height: calc(100vh - ${cfg.launcher_size + 40}px);
            ${posLeft ? "left: 8px;" : "right: 8px;"}
            border-radius: 12px;
          }
        }
      </style>

      <button class="wc-launcher" aria-label="Open chat">${launcherContent}</button>
      <div class="wc-window" role="dialog" aria-label="Chat window">
        <div class="wc-header">
          <div class="wc-header-left">
            ${cfg.bot_avatar_url ? '<img class="wc-header-avatar" src="' + cfg.bot_avatar_url + '" alt="" />' : ""}
            <span>${cfg.header_text}</span>
          </div>
          <button class="wc-header-close" aria-label="Close chat">&times;</button>
        </div>
        <div class="wc-messages" role="log" aria-live="polite"></div>
        <div class="wc-input-area">
          <input class="wc-input" placeholder="${cfg.placeholder_text}" maxlength="${cfg.max_message_length}" />
          <button class="wc-send">Send</button>
        </div>
        ${cfg.show_powered_by ? '<div class="wc-powered">Powered by <a href="#">WonderChat</a></div>' : ""}
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

    // --- Restore persisted messages ---
    const savedMessages = loadMessages();
    if (savedMessages.length > 0) {
      savedMessages.forEach(function (m) { appendMessage(m.text, m.role, m.sources, true); });
    }

    // --- Interactions ---
    function toggleChat() {
      isOpen = !isOpen;
      chatWindow.classList.toggle("open", isOpen);
      if (isOpen) {
        input.focus();
        if (messagesEl.children.length === 0) {
          appendMessage(cfg.welcome_message, "bot");
        }
      }
    }

    launcher.addEventListener("click", toggleChat);
    closeBtn.addEventListener("click", toggleChat);

    function appendMessage(text, role, sources, skipSave) {
      var row = document.createElement("div");
      row.className = "wc-msg-row " + role;

      // Bot avatar
      if (role === "bot" && cfg.bot_avatar_url) {
        var avatar = document.createElement("img");
        avatar.className = "wc-msg-avatar";
        avatar.src = cfg.bot_avatar_url;
        avatar.alt = cfg.bot_name;
        row.appendChild(avatar);
      }

      var bubble = document.createElement("div");
      bubble.className = "wc-msg " + role;
      bubble.textContent = text;
      row.appendChild(bubble);

      messagesEl.appendChild(row);

      // Source links (built with DOM APIs to prevent XSS from stored URLs)
      if (cfg.show_sources && sources && sources.length > 0) {
        var srcDiv = document.createElement("div");
        srcDiv.className = "wc-sources";
        srcDiv.appendChild(document.createTextNode("Sources: "));
        sources.forEach(function (s, i) {
          // Only allow http/https URLs
          if (!/^https?:\/\//i.test(s)) return;
          if (i > 0) srcDiv.appendChild(document.createTextNode(", "));
          var a = document.createElement("a");
          a.href = s;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = s.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
          srcDiv.appendChild(a);
        });
        messagesEl.appendChild(srcDiv);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;

      // Persist
      if (!skipSave) {
        var current = loadMessages();
        current.push({ text: text, role: role, sources: sources || [] });
        saveMessages(current);
      }
    }

    function showTyping() {
      var row = document.createElement("div");
      row.className = "wc-msg-row bot";
      row.id = "wc-typing-row";
      if (cfg.bot_avatar_url) {
        var avatar = document.createElement("img");
        avatar.className = "wc-msg-avatar";
        avatar.src = cfg.bot_avatar_url;
        avatar.alt = "";
        row.appendChild(avatar);
      }
      var typing = document.createElement("div");
      typing.className = "wc-msg bot wc-typing";
      typing.innerHTML = '<div class="wc-typing-dot"></div><div class="wc-typing-dot"></div><div class="wc-typing-dot"></div>';
      row.appendChild(typing);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      var el = shadow.getElementById("wc-typing-row");
      if (el) el.remove();
    }

    async function sendMessage(text) {
      text = (text || input.value).trim();
      if (!text || isLoading) return;

      appendMessage(text, "user");
      input.value = "";
      isLoading = true;
      sendBtn.disabled = true;
      showTyping();

      try {
        var resp = await fetch(API_URL + "/api/v1/chat", {
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
          var err = {};
          try { err = await resp.json(); } catch (e) {}
          throw new Error(err.detail || "Request failed");
        }

        var data = await resp.json();
        appendMessage(data.reply, "bot", data.sources || []);
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

    sendBtn.addEventListener("click", function () { sendMessage(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // --- Auto-open ---
    if (cfg.auto_open) {
      setTimeout(function () {
        if (!isOpen) toggleChat();
      }, cfg.auto_open_delay_ms);
    }

    // --- Public API ---
    window.WonderChat = {
      open: function () { if (!isOpen) toggleChat(); },
      close: function () { if (isOpen) toggleChat(); },
      toggle: function () { toggleChat(); },
      sendMessage: function (text) { sendMessage(text); },
      isOpen: function () { return isOpen; },
      getSessionId: function () { return sessionId; },
      clearHistory: function () {
        messagesEl.innerHTML = "";
        localStorage.removeItem(getStorageKey());
      },
    };
  }

  // --- Initialize: fetch config from backend, then build ---
  async function init() {
    try {
      var resp = await fetch(API_URL + "/api/v1/admin/widget-config?api_key=" + encodeURIComponent(API_KEY));
      if (resp.ok) {
        var serverConfig = await resp.json();
        var merged = Object.assign({}, DEFAULTS, serverConfig);
        buildWidget(merged);
      } else {
        // Backend not reachable -- use defaults + script tag overrides
        var fallback = Object.assign({}, DEFAULTS);
        var color = script.getAttribute("data-color");
        var pos = script.getAttribute("data-position");
        var header = script.getAttribute("data-header");
        if (color) fallback.primary_color = color;
        if (pos) fallback.position = pos;
        if (header) fallback.header_text = header;
        buildWidget(fallback);
      }
    } catch (e) {
      // Network error -- build with defaults
      var fallback = Object.assign({}, DEFAULTS);
      var color = script.getAttribute("data-color");
      var pos = script.getAttribute("data-position");
      var header = script.getAttribute("data-header");
      if (color) fallback.primary_color = color;
      if (pos) fallback.position = pos;
      if (header) fallback.header_text = header;
      buildWidget(fallback);
    }
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
