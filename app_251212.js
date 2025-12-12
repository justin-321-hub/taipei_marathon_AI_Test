/**
 * app.js — Frontend Chat Logic (English Version)
 * ---------------------------------------------------------
 * Key Features:
 * 1) Basic message handling (User/Bot)
 * 2) No-login multi-user support via localStorage clientId
 * 3) Thinking animation control
 * 4) Backend API integration with English response request
 * 5) HTML rendering support for rich text responses
 */

"use strict";

/* =========================
   Backend API Configuration
   ========================= */
const API_BASE = "https://taipei-marathon-ai-test-server.onrender.com";
const api = (p) => `${API_BASE}${p}`;

/* =========================
   Client ID Management
   ========================= */
const CID_KEY = "fourleaf_client_id";
let clientId = localStorage.getItem(CID_KEY);
if (!clientId) {
  clientId =
    (crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CID_KEY, clientId);
}

/* =========================
   DOM Elements
   ========================= */
const elMessages = document.getElementById("messages");
const elInput = document.getElementById("txtInput");
const elBtnSend = document.getElementById("btnSend");
const elThinking = document.getElementById("thinking");

/* =========================
   Message State
   ========================= */
const messages = [];

/* =========================
   Utilities
   ========================= */
const uid = () => Math.random().toString(36).slice(2);
function scrollToBottom() {
  elMessages?.scrollTo({ top: elMessages.scrollHeight, behavior: "smooth" });
}

/**
 * Toggle "Thinking" animation state
 */
function setThinking(on) {
  if (!elThinking) return;
  if (on) {
    elThinking.classList.remove("hidden");
    if (elBtnSend) elBtnSend.disabled = true;
    if (elInput) elInput.disabled = true;
  } else {
    elThinking.classList.add("hidden");
    if (elBtnSend) elBtnSend.disabled = false;
    if (elInput) elInput.disabled = false;
    elInput?.focus();
  }
}

/**
 * Smart Question Mark Handling
 */
function processQuestionMarks(text) {
  let result = text;
  // Remove trailing question marks
  result = result.replace(/[?？]\s*$/g, '');
  // Replace internal question marks with newlines
  result = result.replace(/[?？](?=.)/g, '\n');
  // Clean up multiple newlines
  result = result.replace(/\n\s*\n/g, '\n');
  return result.trim();
}

/**
 * HTML Escape (for User Input Safety)
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* =========================
   Render Messages
   ========================= */
function render() {
  if (!elMessages) return;
  elMessages.innerHTML = "";

  for (const m of messages) {
    const isUser = m.role === "user";

    const row = document.createElement("div");
    row.className = `msg ${isUser ? "user" : "bot"}`;

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = isUser
      ? 'https://raw.githubusercontent.com/justin-321-hub/taipei_marathon/refs/heads/main/assets/user-avatar.png'
      : 'https://raw.githubusercontent.com/justin-321-hub/taipei_marathon/refs/heads/main/assets/logo.png';
    avatar.alt = isUser ? "You" : "Bot";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    
    if (isUser) {
      // User message: Escape HTML for security, convert newlines to <br>
      bubble.innerHTML = escapeHtml(m.text).replace(/\n/g, '<br>');
    } else {
      // Bot message: Render HTML directly (Table, List, Link support)
      bubble.innerHTML = m.text;
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    elMessages.appendChild(row);
  }

  scrollToBottom();
}

/* =========================
   Send Logic
   ========================= */
async function sendText(text) {
  const content = (text ?? elInput?.value ?? "").trim();
  if (!content) return;

  const contentToSend = processQuestionMarks(content);
  
  // Display user message immediately
  const userMsg = { id: uid(), role: "user", text: content, ts: Date.now() };
  messages.push(userMsg);
  if (elInput) elInput.value = "";
  render();

  setThinking(true);

  try {
    // Send to backend
    const res = await fetch(api("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({ 
        text: contentToSend, 
        clientId, 
        language: "英文", // <--- Changed to English
        role: "user"
      }),
    });

    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { errorRaw: raw };
    }

    if (!res.ok) {
      if (res.status === 502 || res.status === 404) {
        throw new Error("Network unstable, please try again.");
      }
      const serverMsg = (data && (data.error || data.body || data.message)) ?? raw ?? "unknown error";
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${serverMsg}`);
    }

    // Process Bot Response
    let replyText;
    
    if (typeof data === "string") {
      replyText = data.trim() || "Please rephrase your question.";
    } else if (data && typeof data === "object") {
      const hasTextField = 'text' in data || 'message' in data;
      
      if (hasTextField) {
        const textValue = data.text !== undefined ? data.text : data.message;
        if (textValue === "" || textValue === null || textValue === undefined) {
          replyText = "Please rephrase your question.";
        } else {
          replyText = String(textValue).trim() || "Please rephrase your question.";
        }
      } else {
        const isPlainEmptyObject = 
          !Array.isArray(data) && 
          Object.keys(data).filter(k => k !== 'clientId').length === 0;
        
        if (isPlainEmptyObject) {
          replyText = "Network error, please try again.";
        } else {
          replyText = JSON.stringify(data, null, 2);
        }
      }
    } else {
      replyText = "Please rephrase your question.";
    }

    const botMsg = { id: uid(), role: "assistant", text: replyText, ts: Date.now() };
    messages.push(botMsg);
    
    setThinking(false);
    render();
  } catch (err) {
    setThinking(false);
    const friendly = (!navigator.onLine && "You are currently offline. Please check your connection and try again.") || `${err?.message || err}`;

    const botErr = {
      id: uid(),
      role: "assistant",
      text: friendly,
      ts: Date.now(),
    };
    messages.push(botErr);
    render();
  }
}

/* =========================
   Event Listeners
   ========================= */
elBtnSend?.addEventListener("click", () => sendText());
elInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});
window.addEventListener("load", () => elInput?.focus());

/* =========================
   Initial Welcome Message
   ========================= */
messages.push({
  id: uid(),
  role: "assistant",
  text: "Welcome to the Taipei Marathon Smart Customer Service!<br>I am your assistant. How can I help you today?",
  ts: Date.now(),
});
render();
