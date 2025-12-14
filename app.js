/**
* app.js — Frontend Chat Logic with API Selector & Start Question Prompt (Modified v3.6)
* ---------------------------------------------------------
* Key Features:
* 1) Basic message handling (User/Bot)
* 2) No-login multi-user support via localStorage clientId
* 3) Thinking animation control
* 4) Backend API integration with language selection
* 5) HTML rendering support for rich text responses
* 6) Batch text file upload - sends lines one by one
* 7) Stop button to interrupt batch processing
* 8) Auto-retry on "Failed to fetch" error (max 1 retry)
* 9) Dynamic API endpoint selection
* 10) Question mark processing for both single and batch mode
* 11) Ask user which question to start from after file upload
*/

"use strict";

/* =========================
Backend API Configuration
========================= */
let API_BASE = "https://taipei-marathon-ai-test-server.onrender.com"; // Default
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
const elBtnUpload = document.getElementById("btnUpload");
const elBtnStop = document.getElementById("btnStop");
const elFileInput = document.getElementById("fileInput");
const elThinking = document.getElementById("thinking");
const elLangSelect = document.getElementById("langSelect");
const elApiSelect = document.getElementById("apiSelect");

/* =========================
Message State
========================= */
const messages = [];

/* =========================
Batch Processing State
========================= */
let batchLines = [];
let batchIndex = 0;
let isBatchProcessing = false;
let shouldStopBatch = false;
let pendingBatchLines = null; // Store lines while waiting for user input

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
    if (elBtnUpload) elBtnUpload.disabled = true;
    if (elLangSelect) elLangSelect.disabled = true;
    if (elApiSelect) elApiSelect.disabled = true;
    if (elInput) elInput.disabled = true;
  } else {
    elThinking.classList.add("hidden");
    if (!isBatchProcessing && !pendingBatchLines) {
      if (elBtnSend) elBtnSend.disabled = false;
      if (elBtnUpload) elBtnUpload.disabled = false;
      if (elLangSelect) elLangSelect.disabled = false;
      if (elApiSelect) elApiSelect.disabled = false;
      if (elInput) elInput.disabled = false;
      elInput?.focus();
    }
  }
}

/**
* Update Stop button state
*/
function updateStopButton() {
  if (!elBtnStop) return;
  if (isBatchProcessing) {
    elBtnStop.disabled = false;
  } else {
    elBtnStop.disabled = true;
  }
}

/**
* Smart Question Mark Handling
* - Remove trailing question marks
* - Replace internal question marks with newlines
* - Clean up multiple newlines
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
Send Logic with Retry
========================= */
async function sendText(text, skipProcessing = false, isRetry = false) {
  const content = (text ?? elInput?.value ?? "").trim();
  if (!content) return;

  // Check if user is responding to start question prompt
  if (pendingBatchLines) {
    handleStartQuestionResponse(content);
    return;
  }

  // Always process question marks
  const contentToSend = processQuestionMarks(content);
  const selectedLanguage = elLangSelect?.value || "英文";

  // Display user message immediately (only on first attempt, not retry)
  if (!isRetry) {
    const userMsg = { id: uid(), role: "user", text: content, ts: Date.now() };
    messages.push(userMsg);
    if (elInput) elInput.value = "";
    render();
  }

  setThinking(true);

  try {
    // Send to backend (使用動態的 API_BASE)
    const res = await fetch(api("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({
        text: contentToSend,
        clientId,
        language: selectedLanguage,
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

    // Continue batch processing if active and not stopped
    if (isBatchProcessing && !shouldStopBatch) {
      processBatchNext();
    } else if (shouldStopBatch) {
      // User requested stop
      stopBatchProcessing(true);
    }

  } catch (err) {
    // Check if error is "Failed to fetch"
    const isFetchError = err.message && err.message.toLowerCase().includes('failed to fetch');

    // Retry logic: if it's a fetch error and not already a retry
    if (isFetchError && !isRetry) {
      console.log('🔄 Failed to fetch detected, retrying once...');

      // Show retry message
      const retryMsg = {
        id: uid(),
        role: "assistant",
        text: "🔄 連線失敗，正在重試...",
        ts: Date.now(),
      };
      messages.push(retryMsg);
      render();

      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Retry the request
      return sendText(content, skipProcessing, true);
    }

    // If it's a retry and still failed, or not a fetch error
    setThinking(false);

    let friendly;
    if (isFetchError && isRetry) {
      friendly = "❌ 連線失敗（已重試），跳過此問題";
    } else {
      friendly = (!navigator.onLine && "You are currently offline. Please check your connection and try again.") || `${err?.message || err}`;
    }

    const botErr = {
      id: uid(),
      role: "assistant",
      text: friendly,
      ts: Date.now(),
    };
    messages.push(botErr);
    render();

    // In batch mode: continue to next question if retry also failed
    if (isBatchProcessing && isFetchError && isRetry) {
      console.log('⏭️ Skipping to next question after retry failure');
      if (!shouldStopBatch) {
        processBatchNext();
      } else {
        stopBatchProcessing(true);
      }
    } else if (isBatchProcessing && !isFetchError) {
      // Stop batch processing on other types of errors
      stopBatchProcessing(false, true);
    }
  }
}

/* =========================
Start Question Prompt Handler
========================= */
function handleStartQuestionResponse(input) {
  const startNum = parseInt(input.trim());

  // Display user input
  const userMsg = { id: uid(), role: "user", text: input, ts: Date.now() };
  messages.push(userMsg);
  if (elInput) elInput.value = "";
  render();

  // Validate input
  if (isNaN(startNum) || startNum < 1 || startNum > pendingBatchLines.length) {
    const errorMsg = {
      id: uid(),
      role: "assistant",
      text: `❌ 無效的數字！請輸入 1 到 ${pendingBatchLines.length} 之間的數字。`,
      ts: Date.now(),
    };
    messages.push(errorMsg);
    render();
    return;
  }

  // Valid input - start batch processing
  const lines = pendingBatchLines;
  pendingBatchLines = null;

  const confirmMsg = {
    id: uid(),
    role: "assistant",
    text: `✅ 將從第 ${startNum} 個問題開始處理，共 ${lines.length - startNum + 1} 個問題。`,
    ts: Date.now(),
  };
  messages.push(confirmMsg);
  render();

  // Enable controls
  if (elBtnSend) elBtnSend.disabled = false;
  if (elBtnUpload) elBtnUpload.disabled = false;
  if (elLangSelect) elLangSelect.disabled = false;
  if (elApiSelect) elApiSelect.disabled = false;
  if (elInput) {
    elInput.disabled = false;
    elInput.placeholder = "請輸入您的問題...";
  }

  // Start batch processing from the specified question
  startBatchProcessing(lines, startNum);
}

/* =========================
Batch Processing Functions
========================= */
function processBatchNext() {
  // Check if user requested stop
  if (shouldStopBatch) {
    stopBatchProcessing(true);
    return;
  }

  if (batchIndex >= batchLines.length) {
    stopBatchProcessing(false, false, true);
    return;
  }

  const line = batchLines[batchIndex].trim();
  batchIndex++;

  if (line) {
    // Send the line (with question mark processing)
    sendText(line, false);
  } else {
    // Skip empty lines
    processBatchNext();
  }
}

function stopBatchProcessing(userStopped = false, hasError = false, completed = false) {
  isBatchProcessing = false;
  shouldStopBatch = false;
  const processedCount = batchIndex;
  const totalCount = batchLines.length;
  batchLines = [];
  batchIndex = 0;

  updateStopButton();
  setThinking(false);

  let statusMsg;
  if (userStopped) {
    statusMsg = `⏸️ 批次處理已中斷！已處理 ${processedCount}/${totalCount} 個問題`;
  } else if (hasError) {
    statusMsg = `⚠️ 批次處理因錯誤中止！已處理 ${processedCount}/${totalCount} 個問題`;
  } else if (completed) {
    statusMsg = `✅ 批次處理完成！共處理 ${totalCount} 個問題`;
  }

  if (statusMsg) {
    const msg = {
      id: uid(),
      role: "assistant",
      text: statusMsg,
      ts: Date.now(),
    };
    messages.push(msg);
    render();
  }
}

function startBatchProcessing(lines, startFrom = 1) {
  batchLines = lines;
  batchIndex = startFrom - 1; // Convert to 0-based index
  isBatchProcessing = true;
  shouldStopBatch = false;

  updateStopButton();

  const actualCount = lines.length - batchIndex;
  const startMsg = {
    id: uid(),
    role: "assistant",
    text: `📋 開始批次處理，從第 ${startFrom} 個問題開始，共 ${actualCount} 個問題<br>⏱️ 每次回應後將等待 1 秒再發送下一題<br>✂️ 自動移除問號 "?" 並將句中問號轉換為換行`,
    ts: Date.now(),
  };
  messages.push(startMsg);
  render();

  processBatchNext();
}

/* =========================
File Upload Handler
========================= */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length === 0) {
      const errorMsg = {
        id: uid(),
        role: "assistant",
        text: "❌ 文件為空或格式錯誤",
        ts: Date.now(),
      };
      messages.push(errorMsg);
      render();
      return;
    }

    // Store lines and ask user which question to start from
    pendingBatchLines = lines;

    const promptMsg = {
      id: uid(),
      role: "assistant",
      text: `📁 已讀取文件，共 ${lines.length} 個問題。<br><br>❓ 請輸入要從第幾個問題開始處理（1-${lines.length}）：<br><small>💡 輸入 1 表示從第一個問題開始，輸入 ${lines.length} 表示只處理最後一個問題</small>`,
      ts: Date.now(),
    };
    messages.push(promptMsg);
    render();

    // Disable upload button and enable input
    if (elBtnUpload) elBtnUpload.disabled = true;
    if (elLangSelect) elLangSelect.disabled = true;
    if (elApiSelect) elApiSelect.disabled = true;
    if (elInput) {
      elInput.disabled = false;
      elInput.placeholder = `請輸入 1-${lines.length} 之間的數字...`;
      elInput.focus();
    }
  };

  reader.onerror = function() {
    const errorMsg = {
      id: uid(),
      role: "assistant",
      text: "❌ 文件讀取失敗",
      ts: Date.now(),
    };
    messages.push(errorMsg);
    render();
  };

  reader.readAsText(file);

  // Reset file input
  event.target.value = '';
}

/* =========================
API Selection Handler
========================= */
elApiSelect?.addEventListener("change", () => {
  API_BASE = elApiSelect.value;
  console.log(`🔄 API endpoint changed to: ${API_BASE}`);

  // Show notification
  const notifyMsg = {
    id: uid(),
    role: "assistant",
    text: `🔄 已切換到：${elApiSelect.options[elApiSelect.selectedIndex].text}`,
    ts: Date.now(),
  };
  messages.push(notifyMsg);
  render();
});

/* =========================
Event Listeners
========================= */
elBtnSend?.addEventListener("click", () => {
  if (!isBatchProcessing) {
    sendText();
  }
});

elBtnUpload?.addEventListener("click", () => {
  if (!isBatchProcessing && !pendingBatchLines) {
    elFileInput?.click();
  }
});

elBtnStop?.addEventListener("click", () => {
  if (isBatchProcessing) {
    shouldStopBatch = true;
    const stopMsg = {
      id: uid(),
      role: "assistant",
      text: "⏸️ 正在中斷批次處理，請稍候...",
      ts: Date.now(),
    };
    messages.push(stopMsg);
    render();
  }
});

elFileInput?.addEventListener("change", handleFileUpload);

elInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isBatchProcessing) {
      sendText();
    }
  }
});

window.addEventListener("load", () => elInput?.focus());

/* =========================
Initial Welcome Message
========================= */
messages.push({
  id: uid(),
  role: "assistant",
  text: "Welcome to the Taipei Marathon Smart Customer Service!<br>I am your assistant. How can I help you today?<br><br>💡 提示：您可以使用「📤 上傳」按鈕上傳 .txt 文件進行批次提問",
  ts: Date.now(),
});
render();
