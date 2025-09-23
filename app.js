/**
 * app.js — 前端純 JS 聊天室邏輯（無框架）
 * ---------------------------------------------------------
 * 功能重點：
 * 1) 基本訊息串接與渲染（使用者/機器人）
 * 2) 免登入多使用者：以 localStorage 建立 clientId
 * 3) 思考中動畫控制（輸入禁用/解禁）
 * 4) 呼叫後端 /api/chat，強化回應解析與錯誤處理
 * 5) ★ 修正：當 text 為空字串時，顯示「請換個說法，謝謝您」
 * 6) ★ 新增：傳送到後端之前，刪除所有輸入文字的問號
 *    - 若問號在句尾，直接刪除
 *    - 若問號不在句尾，刪除後加入換行
 * 7) ★ 新增：當回覆內容包含「成績查詢」時，自動附加查詢網址
 * 8) ★ 新增：當回覆內容包含「中央氣象局」時，自動附加氣象查詢網址
 * 9) ★ 新增：當回覆內容包含「馬拉松運動博覽會」時，自動附加博覽會網址
 *
 * 依賴：
 * - 頁面需有以下元素：
 *   #messages, #txtInput, #btnSend, #thinking
 *
 * 注意：
 * - 本檔案為單純前端邏輯，不含任何打包或框架語法。
 */

"use strict";

/* =========================
   後端 API 網域（可依環境調整）
   ========================= */
const API_BASE = "https://taipei-marathon-ai-test-server.onrender.com";
const api = (p) => `${API_BASE}${p}`;

/* =========================
   免登入多使用者：clientId
   - 以 localStorage 永續化
   - 預設使用 crypto.randomUUID()，若不支援則以時間戳+隨機碼
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
   DOM 參照
   ========================= */
const elMessages = document.getElementById("messages");
const elInput = document.getElementById("txtInput");
const elBtnSend = document.getElementById("btnSend");
const elThinking = document.getElementById("thinking"); // ★ 思考動畫容器（如 spinner）

/* =========================
   訊息狀態（簡易記憶體）
   - 格式：{ id, role, text, ts }
   - role 僅為 'user' | 'assistant'
   ========================= */
/** @type {{id:string, role:'user'|'assistant', text:string, ts:number}[]} */
const messages = [];

/* =========================
   小工具
   ========================= */
const uid = () => Math.random().toString(36).slice(2);
function scrollToBottom() {
  // 使用 smooth 行為讓滾動自然
  elMessages?.scrollTo({ top: elMessages.scrollHeight, behavior: "smooth" });
}

/**
 * 切換「思考中」動畫與輸入狀態
 * - on=true：顯示思考動畫、禁用輸入與送出按鈕
 * - on=false：關閉動畫、恢復輸入
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
    // 解除禁用後讓輸入框自動聚焦
    elInput?.focus();
  }
}

/**
 * ★ 新增：智能處理問號
 * - 句尾的問號：直接刪除
 * - 句中的問號：替換為換行
 * @param {string} text - 原始文字
 * @returns {string} - 處理後的文字
 */
function processQuestionMarks(text) {
  let result = text;
  
  // 先處理句尾的問號（包含可能的空白）
  // 匹配結尾的問號（半形或全形），可能跟著空白字符
  result = result.replace(/[?？]\s*$/g, '');
  
  // 再處理句中的問號
  // 將非結尾的問號替換為換行
  // 注意：這裡使用前瞻斷言來確保問號後面還有字符
  result = result.replace(/[?？](?=.)/g, '\n');
  
  // 清理多餘的換行和空白
  // 將多個連續換行合併為一個
  result = result.replace(/\n\s*\n/g, '\n');
  
  // 去除首尾空白
  result = result.trim();
  
  return result;
}

/**
 * ★ 新增：處理成績查詢相關的回覆
 * 當文字中包含「成績查詢」時，自動附加查詢網址
 * @param {string} text - 原始回覆文字
 * @returns {string} - 處理後的文字
 */
function processScoreQueryResponse(text) {
  // 定義成績查詢的關鍵詞
  const scoreKeywords = ['成績查詢', '查詢成績', '比賽成績', '馬拉松成績', '查成績'];
  const scoreQueryUrl = 'https://www.sportsnet.org.tw/score.php';
  
  // 檢查是否包含成績查詢相關關鍵詞
  const hasScoreQuery = scoreKeywords.some(keyword => text.includes(keyword));
  
  if (hasScoreQuery) {
    // 檢查是否已經包含了網址（避免重複添加）
    if (!text.includes(scoreQueryUrl)) {
      // 在成績查詢相關內容後添加網址
      // 找到最後一個成績查詢關鍵詞的位置
      let lastKeywordIndex = -1;
      let matchedKeyword = '';
      
      scoreKeywords.forEach(keyword => {
        const index = text.lastIndexOf(keyword);
        if (index > lastKeywordIndex) {
          lastKeywordIndex = index;
          matchedKeyword = keyword;
        }
      });
      
      if (lastKeywordIndex !== -1) {
        // 在關鍵詞後插入網址
        const beforeKeyword = text.substring(0, lastKeywordIndex + matchedKeyword.length);
        const afterKeyword = text.substring(lastKeywordIndex + matchedKeyword.length);
        
        // 組合新文字，在關鍵詞後加上網址
        text = beforeKeyword + '\n' + scoreQueryUrl + afterKeyword;
      } else {
        // 如果找不到具體位置，就在文字末尾加上
        text = text + '\n\n成績查詢網址：' + scoreQueryUrl;
      }
    }
  }
  
  return text;
}

/**
 * ★ 新增：處理中央氣象局相關的回覆
 * 當文字中包含「中央氣象局」時，自動附加氣象查詢網址
 * @param {string} text - 原始回覆文字
 * @returns {string} - 處理後的文字
 */
function processWeatherResponse(text) {
  // 定義中央氣象局的關鍵詞
  const weatherKeywords = ['中央氣象局', '中央氣象署', '氣象局'];
  const weatherUrl = 'https://www.cwa.gov.tw/V8/C/W/Town/Town.html?TID=6300200';
  
  // 檢查是否包含中央氣象局相關關鍵詞
  const hasWeatherKeyword = weatherKeywords.some(keyword => text.includes(keyword));
  
  if (hasWeatherKeyword) {
    // 檢查是否已經包含了網址（避免重複添加）
    if (!text.includes(weatherUrl)) {
      // 在中央氣象局相關內容後添加網址
      // 找到最後一個關鍵詞的位置
      let lastKeywordIndex = -1;
      let matchedKeyword = '';
      
      weatherKeywords.forEach(keyword => {
        const index = text.lastIndexOf(keyword);
        if (index > lastKeywordIndex) {
          lastKeywordIndex = index;
          matchedKeyword = keyword;
        }
      });
      
      if (lastKeywordIndex !== -1) {
        // 在關鍵詞後插入網址
        const beforeKeyword = text.substring(0, lastKeywordIndex + matchedKeyword.length);
        const afterKeyword = text.substring(lastKeywordIndex + matchedKeyword.length);
        
        // 組合新文字，在關鍵詞後加上網址
        text = beforeKeyword + '\n' + weatherUrl + afterKeyword;
      } else {
        // 如果找不到具體位置，就在文字末尾加上
        text = text + '\n\n天氣查詢網址：' + weatherUrl;
      }
    }
  }
  
  return text;
}

/**
 * ★ 新增：處理馬拉松運動博覽會相關的回覆
 * 當文字中包含「馬拉松運動博覽會」時，自動附加博覽會網址
 * @param {string} text - 原始回覆文字
 * @returns {string} - 處理後的文字
 */
function processExpoResponse(text) {
  // 定義馬拉松運動博覽會的關鍵詞
  const expoKeywords = ['馬拉松運動博覽會', '運動博覽會', '馬拉松博覽會', 'EXPO'];
  const expoUrl = 'https://marathonexpo.tw/';
  
  // 檢查是否包含博覽會相關關鍵詞
  const hasExpoKeyword = expoKeywords.some(keyword => text.includes(keyword));
  
  if (hasExpoKeyword) {
    // 檢查是否已經包含了網址（避免重複添加）
    if (!text.includes(expoUrl)) {
      // 在博覽會相關內容後添加網址
      // 找到最後一個關鍵詞的位置
      let lastKeywordIndex = -1;
      let matchedKeyword = '';
      
      expoKeywords.forEach(keyword => {
        const index = text.lastIndexOf(keyword);
        if (index > lastKeywordIndex) {
          lastKeywordIndex = index;
          matchedKeyword = keyword;
        }
      });
      
      if (lastKeywordIndex !== -1) {
        // 在關鍵詞後插入網址
        const beforeKeyword = text.substring(0, lastKeywordIndex + matchedKeyword.length);
        const afterKeyword = text.substring(lastKeywordIndex + matchedKeyword.length);
        
        // 組合新文字，在關鍵詞後加上網址
        text = beforeKeyword + '\n' + expoUrl + afterKeyword;
      } else {
        // 如果找不到具體位置，就在文字末尾加上
        text = text + '\n\n博覽會網址：' + expoUrl;
      }
    }
  }
  
  return text;
}

/* =========================
   將 messages 渲染到畫面（支援可點擊的連結）
   ========================= */
function render() {
  if (!elMessages) return;
  elMessages.innerHTML = "";

  for (const m of messages) {
    const isUser = m.role === "user";

    // 外層一列
    const row = document.createElement("div");
    row.className = `msg ${isUser ? "user" : "bot"}`;

    // 頭像
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = isUser
      ? 'https://raw.githubusercontent.com/justin-321-hub/taipei_marathon/refs/heads/main/assets/user-avatar.png'
      : 'https://raw.githubusercontent.com/justin-321-hub/taipei_marathon/refs/heads/main/assets/logo.png';
    avatar.alt = isUser ? "you" : "bot";

    // 對話泡泡
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    
    // 將文字中的 URL 轉換為可點擊的連結
    const textWithLinks = m.text.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" style="color: #0066cc; text-decoration: underline;">$1</a>'
    );
    
    // 使用 innerHTML 來支援連結，但要注意 XSS 風險
    // 由於這是我們自己控制的內容，相對安全
    bubble.innerHTML = textWithLinks.replace(/\n/g, '<br>');

    // 組合
    row.appendChild(avatar);
    row.appendChild(bubble);
    elMessages.appendChild(row);
  }

  scrollToBottom();
}

/* =========================
   呼叫後端，並顯示雙方訊息
   - 入口：sendText(text?)
   - 若無 text 參數，則取 input 欄位的值
   ========================= */
async function sendText(text) {
  const content = (text ?? elInput?.value ?? "").trim();
  if (!content) return;

  // ★ 新增：使用智能問號處理函數
  const contentToSend = processQuestionMarks(content);
  
  // 先插入使用者訊息到畫面（顯示原始內容，包含問號）
  const userMsg = { id: uid(), role: "user", text: content, ts: Date.now() };
  messages.push(userMsg);
  if (elInput) elInput.value = "";
  render();

  // 進入思考中（直到收到回覆才關閉）
  setThinking(true);

  try {
    // 呼叫後端 /api/chat（傳送已處理問號的內容）
    const res = await fetch(api("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({ 
        text: contentToSend,  // ★ 使用已處理問號的內容
        clientId, 
        language: "繁體中文" 
      }),
    });

    // 以文字讀回（避免直接 .json() 遇到空字串拋錯）
    const raw = await res.text();

    // 嘗試 JSON 解析；若 raw 為空字串，視為 {}
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // 若 JSON 解析失敗，保留原始字串於 errorRaw 便於除錯
      data = { errorRaw: raw };
    }

    // HTTP 狀態非 2xx 時，直接丟錯
    if (!res.ok) {
      // ★ 新增：特別處理 502 / 404
      if (res.status === 502 || res.status === 404) {
        throw new Error("網路不穩定，請再試一次!");
      }

      // 優先使用後端提供的錯誤訊息欄位
      const serverMsg =
        (data && (data.error || data.body || data.message)) ?? raw ?? "unknown error";
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${serverMsg}`);
    }

    /**
     * ★ 修正：整理機器人要顯示的文字
     * 規則：
     * 1) 若 data 是字串，直接當回覆
     * 2) 若 data 是物件且有 text 或 message 欄位：
     *    - 如果內容為空字串 → 顯示「請換個說法，謝謝您」
     *    - 如果有內容 → 顯示該內容
     * 3) 若是空物件 {} → 顯示「網路不穩定，請再試一次」
     * 4) 其他物件 → JSON 字串化後顯示（利於除錯）
     */
    let replyText;
    
    if (typeof data === "string") {
      // 情況1: data 本身就是字串
      replyText = data.trim() || "請換個說法，謝謝您";
    } else if (data && typeof data === "object") {
      // 情況2: data 是物件
      
      // 檢查是否有 text 或 message 欄位
      const hasTextField = 'text' in data || 'message' in data;
      
      if (hasTextField) {
        // 有 text 或 message 欄位，取出其值
        const textValue = data.text !== undefined ? data.text : data.message;
        
        // 確保是字串並處理空值情況
        if (textValue === "" || textValue === null || textValue === undefined) {
          // ★ 關鍵修正：當 text 欄位存在但為空時，顯示「請換個說法，謝謝您」
          replyText = "請換個說法，謝謝您";
        } else {
          // 有實際內容時顯示內容
          replyText = String(textValue).trim() || "請換個說法，謝謝您";
        }
      } else {
        // 沒有 text 或 message 欄位
        const isPlainEmptyObject = 
          !Array.isArray(data) && 
          Object.keys(data).filter(k => k !== 'clientId').length === 0;
        
        if (isPlainEmptyObject) {
          // 空物件或只有 clientId 的物件
          replyText = "網路不穩定，請再試一次";
        } else {
          // 其他物件，顯示 JSON 便於除錯
          replyText = JSON.stringify(data, null, 2);
        }
      }
    } else {
      // 其他非預期的資料型態
      replyText = "請換個說法，謝謝您";
    }

    // ★ 新增：處理成績查詢相關的回覆
    replyText = processScoreQueryResponse(replyText);
    
    // ★ 新增：處理中央氣象局相關的回覆
    replyText = processWeatherResponse(replyText);
    
    // ★ 新增：處理馬拉松運動博覽會相關的回覆
    replyText = processExpoResponse(replyText);

    // 推入機器人訊息
    const botMsg = { id: uid(), role: "assistant", text: replyText, ts: Date.now() };
    messages.push(botMsg);
    
    // 關閉思考中 → 再渲染
    setThinking(false);
    render();
  } catch (err) {
    // 發生錯誤時也要關閉思考動畫
    setThinking(false);

    // 統一錯誤訊息格式
    const friendly =
      // 若使用者裝置離線，提供更直覺提示
      (!navigator.onLine && "目前處於離線狀態，請檢查網路連線後再試一次") ||
      // 其他錯誤，帶上簡短錯誤說明
      `${err?.message || err}`;

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
   事件綁定（移除語音錄製事件）
   ========================= */

// 按鈕點擊送出
elBtnSend?.addEventListener("click", () => sendText());

// Enter 送出（Shift+Enter 換行）
elInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 防止換行
    sendText();
  }
});

// 頁面載入完成後讓輸入框聚焦（可選）
window.addEventListener("load", () => elInput?.focus());

/* =========================
   初始化歡迎訊息（移除語音提示）
   ========================= */
messages.push({
  id: uid(),
  role: "assistant",
  text:
    "歡迎來到臺北馬拉松智慧客服！\n我是小幫手，隨時為您解答~ 有什麼問題可以為您解答的嗎?",
  ts: Date.now(),
});
render();

