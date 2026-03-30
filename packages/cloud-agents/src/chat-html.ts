/**
 * Embedded chat UI HTML — served at / and /chat from the cloud worker.
 *
 * Synced from packages/ui-minimal/index.html with personality header,
 * mode badge, greeting, code block copy, mode switcher, and tone themes.
 *
 * WebSocket URL is derived dynamically from window.location so it works
 * on any domain without rebuild. API URLs are relative for Workers context.
 */

export const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>cocapn — chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #1a1a2e;
      --surface:  #16213e;
      --surface2: #1e2a45;
      --border:   #2a3555;
      --text:     #e0e0e0;
      --muted:    #7a8ba8;
      --primary:  #6c8cff;
      --primary2: rgba(108,140,255,0.15);
      --user-bg:  rgba(108,140,255,0.12);
      --user-bdr: rgba(108,140,255,0.3);
      --success:  #4ade80;
      --danger:   #f87171;
      --warn:     #facc15;
      --radius:   8px;
      --font:     -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --mono:     'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
    }

    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.5; }

    /* Layout */
    #app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; }

    /* Header */
    header {
      display: flex; align-items: center; gap: 10px;
      padding: 0 16px; height: 44px; min-height: 44px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    header .logo { font-family: var(--mono); font-weight: 600; font-size: 14px; color: var(--primary); letter-spacing: 0.5px; }
    header .spacer { flex: 1; }

    /* Personality Header */
    .personality-header {
      display: flex; align-items: center; gap: 8px;
    }
    .personality-emoji {
      font-size: 20px; line-height: 1;
    }
    .personality-name {
      font-weight: 600; font-size: 14px; color: var(--text);
    }
    .mode-badge {
      font-size: 10px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.6px; padding: 2px 7px; border-radius: 4px;
      background: var(--primary2); color: var(--primary);
      border: 1px solid rgba(108,140,255,0.25);
    }
    .mode-badge.private-mode {
      background: rgba(250,204,21,0.12); color: var(--warn);
      border-color: rgba(250,204,21,0.3);
    }

    /* Personality Header Strip */
    .personality-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .personality-header .agent-name { font-weight: 600; font-size: 16px; }
    .personality-header .agent-greeting { color: var(--muted); font-size: 13px; }
    .personality-header .mode-badge {
      margin-left: auto;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .mode-badge.public { background: rgba(74,222,128,0.2); color: #4ade80; }
    .mode-badge.private { background: rgba(108,140,255,0.2); color: #6c8cff; }
    .mode-badge.maintenance { background: rgba(250,204,21,0.2); color: #facc15; }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--success);
      display: inline-block;
    }

    .status {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--muted);
    }
    .status .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--border);
    }
    .status .dot.on { background: var(--success); }
    .status .dot.warn { background: var(--warn); animation: pulse 1.5s infinite; }

    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .btn {
      background: none; border: 1px solid var(--border); color: var(--muted);
      padding: 4px 12px; border-radius: var(--radius); font-size: 12px;
      cursor: pointer; transition: all 0.15s;
    }
    .btn:hover { color: var(--text); border-color: var(--primary); background: var(--primary2); }

    .btn-icon {
      background: none; border: 1px solid var(--border); color: var(--muted);
      width: 32px; height: 32px; border-radius: var(--radius);
      cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .btn-icon:hover { color: var(--text); border-color: var(--primary); background: var(--primary2); }
    .btn-icon.active { color: var(--primary); border-color: var(--primary); background: var(--primary2); }

    .btn-icon svg { width: 16px; height: 16px; }

    /* Body */
    .body { display: flex; flex: 1; overflow: hidden; }

    /* Chat */
    .chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column;
    }

    .msg { display: flex; margin-bottom: 12px; max-width: 80%; }
    .msg.user { align-self: flex-end; }
    .msg.agent { align-self: flex-start; }
    .msg.system { align-self: center; }

    .bubble {
      padding: 8px 12px; border-radius: var(--radius);
      word-break: break-word;
      font-size: 14px; line-height: 1.6;
    }
    .msg.user .bubble {
      background: var(--user-bg); border: 1px solid var(--user-bdr);
      border-bottom-right-radius: 2px;
    }
    .msg.agent .bubble {
      background: var(--surface); border: 1px solid var(--border);
      border-bottom-left-radius: 2px;
    }
    .msg.system .bubble {
      background: transparent; color: var(--muted); font-size: 12px; font-style: italic;
      border: none; padding: 4px 8px;
    }

    .agent-label {
      font-size: 11px; font-family: var(--mono); color: var(--primary);
      margin-bottom: 2px; opacity: 0.7;
    }

    .typing { display: inline-block; }
    .typing span {
      display: inline-block; width: 6px; height: 14px;
      background: var(--primary); margin-left: 2px;
      animation: blink 1.2s infinite;
      border-radius: 1px; vertical-align: text-bottom;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }

    /* Empty state */
    .empty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: var(--muted); text-align: center;
    }
    .empty .icon { font-size: 28px; opacity: 0.25; margin-bottom: 8px; }
    .empty p { font-size: 14px; }
    .empty .hint { font-size: 12px; opacity: 0.6; margin-top: 4px; }
    .empty .greeting {
      font-size: 16px; color: var(--text); margin-bottom: 4px;
      font-style: normal; opacity: 1;
    }

    /* Input */
    .input-bar {
      border-top: 1px solid var(--border);
      padding: 10px 16px;
      display: flex; gap: 8px; align-items: flex-end;
    }
    .input-bar textarea {
      flex: 1; background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); color: var(--text);
      padding: 8px 12px; font-size: 14px; font-family: var(--font);
      resize: none; min-height: 38px; max-height: 140px;
      outline: none; transition: border-color 0.15s;
    }
    .input-bar textarea:focus { border-color: var(--primary); }
    .input-bar textarea::placeholder { color: var(--muted); }

    .send-btn {
      width: 38px; height: 38px; border-radius: var(--radius);
      border: 1px solid var(--primary); background: var(--primary2);
      color: var(--primary); cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .send-btn:hover { background: var(--primary); color: #fff; }
    .send-btn:disabled { opacity: 0.3; cursor: not-allowed; border-color: var(--border); color: var(--border); }
    .send-btn:disabled:hover { background: var(--primary2); color: var(--border); }

    .send-btn svg { width: 16px; height: 16px; }

    /* Sidebar — Memory Browser */
    .sidebar {
      width: 300px; border-left: 1px solid var(--border);
      display: none; flex-direction: column; overflow: hidden;
      background: var(--surface);
    }

    .sidebar-tabs {
      display: flex; border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .sidebar-tab {
      flex: 1; padding: 10px 0; text-align: center;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--muted); cursor: pointer; border: none;
      background: none; transition: all 0.15s;
      border-bottom: 2px solid transparent;
      font-family: var(--font); font-weight: 500;
    }
    .sidebar-tab:hover { color: var(--text); }
    .sidebar-tab.active { color: var(--primary); border-bottom-color: var(--primary); }

    .sidebar-content {
      flex: 1; overflow-y: auto; padding: 0;
    }

    .tab-panel { display: none; height: 100%; flex-direction: column; }
    .tab-panel.active { display: flex; }

    /* Facts Tab */
    .fact-add {
      padding: 10px 12px; border-bottom: 1px solid var(--border);
      display: flex; gap: 6px; flex-shrink: 0;
    }
    .fact-add input {
      flex: 1; background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); color: var(--text);
      padding: 6px 10px; font-size: 12px; font-family: var(--font);
      outline: none; transition: border-color 0.15s;
    }
    .fact-add input:focus { border-color: var(--primary); }
    .fact-add input::placeholder { color: var(--muted); }
    .fact-add .fact-key { flex: 1; min-width: 0; }
    .fact-add .fact-val { flex: 1.2; min-width: 0; }
    .fact-add button {
      width: 28px; height: 28px; border-radius: var(--radius);
      border: 1px solid var(--primary); background: var(--primary2);
      color: var(--primary); cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 600; transition: all 0.15s;
    }
    .fact-add button:hover { background: var(--primary); color: #fff; }

    .facts-list {
      flex: 1; overflow-y: auto; padding: 4px 0;
    }

    .fact-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 12px; margin: 3px 8px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 6px; font-size: 12px;
      transition: border-color 0.15s;
    }
    .fact-chip:hover { border-color: rgba(108,140,255,0.3); }
    .fact-chip .chip-key {
      color: var(--primary); font-family: var(--mono); font-size: 11px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;
    }
    .fact-chip .chip-sep { color: var(--muted); flex-shrink: 0; }
    .fact-chip .chip-val {
      color: var(--text); flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .fact-chip .chip-del {
      width: 18px; height: 18px; border: none; background: none;
      color: var(--muted); cursor: pointer; flex-shrink: 0;
      border-radius: 4px; display: flex; align-items: center; justify-content: center;
      font-size: 13px; transition: all 0.15s; opacity: 0;
    }
    .fact-chip:hover .chip-del { opacity: 1; }
    .fact-chip .chip-del:hover { color: var(--danger); background: rgba(248,113,113,0.12); }

    /* Wiki Tab */
    .wiki-search {
      padding: 10px 12px; border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .wiki-search input {
      width: 100%; background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); color: var(--text);
      padding: 6px 10px; font-size: 12px; font-family: var(--font);
      outline: none; transition: border-color 0.15s;
    }
    .wiki-search input:focus { border-color: var(--primary); }
    .wiki-search input::placeholder { color: var(--muted); }

    .wiki-list {
      flex: 1; overflow-y: auto; padding: 4px 0;
    }

    .wiki-item {
      padding: 8px 12px; margin: 2px 8px;
      border-radius: 6px; cursor: pointer;
      transition: background 0.15s;
    }
    .wiki-item:hover { background: var(--surface2); }
    .wiki-item .wiki-title {
      font-size: 13px; font-weight: 500; color: var(--text);
    }
    .wiki-item .wiki-file {
      font-size: 11px; color: var(--muted); font-family: var(--mono);
      margin-top: 1px;
    }

    .wiki-content {
      display: none; flex-direction: column; flex: 1;
      overflow-y: auto;
    }
    .wiki-content.active { display: flex; }
    .wiki-content-back {
      padding: 8px 12px; border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .wiki-content-back button {
      background: none; border: none; color: var(--primary);
      cursor: pointer; font-size: 12px; font-family: var(--font);
      padding: 2px 0; display: flex; align-items: center; gap: 4px;
    }
    .wiki-content-back button:hover { text-decoration: underline; }
    .wiki-content-body {
      padding: 12px; font-size: 13px; line-height: 1.7;
      word-break: break-word;
      color: var(--text);
    }
    .wiki-content-body h1, .wiki-content-body h2, .wiki-content-body h3 {
      color: var(--primary); margin: 12px 0 6px;
    }
    .wiki-content-body h1:first-child { margin-top: 0; }
    .wiki-content-body code {
      font-family: var(--mono); font-size: 12px;
      background: rgba(0,0,0,0.3); padding: 1px 4px;
      border-radius: 3px;
    }

    /* Soul Tab */
    .soul-content {
      flex: 1; overflow-y: auto; padding: 12px;
      font-size: 13px; line-height: 1.7;
      word-break: break-word;
      color: var(--text);
    }
    .soul-content h1, .soul-content h2, .soul-content h3 {
      color: var(--primary); margin: 12px 0 6px;
    }
    .soul-content code {
      font-family: var(--mono); font-size: 12px;
      background: rgba(0,0,0,0.3); padding: 1px 4px;
      border-radius: 3px;
    }

    /* Shared sidebar empty */
    .sidebar-empty {
      padding: 20px 14px; color: var(--muted); font-size: 12px;
      font-style: italic; text-align: center;
    }

    /* Mobile toggle (hides brain btn on desktop, shows on mobile) */
    .sidebar-toggle-mobile { display: none; }

    /* Code blocks */
    .bubble code {
      font-family: var(--mono); font-size: 13px;
      background: rgba(0,0,0,0.3); padding: 2px 5px;
      border-radius: 4px;
    }
    .bubble pre {
      margin: 6px 0; background: rgba(0,0,0,0.3);
      padding: 10px; border-radius: 6px;
      overflow-x: auto; font-family: var(--mono); font-size: 12px;
      line-height: 1.5;
    }

    /* Code block with copy button */
    .code-block-wrapper {
      position: relative; margin: 6px 0;
    }
    .code-block-wrapper pre {
      margin: 0; background: rgba(0,0,0,0.3);
      padding: 10px; padding-top: 28px;
      border-radius: 6px;
      overflow-x: auto; font-family: var(--mono); font-size: 12px;
      line-height: 1.5;
    }
    .code-block-label {
      position: absolute; top: 4px; left: 10px;
      font-size: 10px; color: var(--muted);
      font-family: var(--mono); text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .code-copy-btn {
      position: absolute; top: 2px; right: 4px;
      background: none; border: 1px solid var(--border);
      color: var(--muted); padding: 2px 8px;
      border-radius: 4px; font-size: 11px;
      cursor: pointer; transition: all 0.15s;
      font-family: var(--font);
    }
    .code-copy-btn:hover { color: var(--text); border-color: var(--primary); background: var(--primary2); }
    .code-copy-btn.copied { color: var(--success); border-color: var(--success); }

    /* Mode switcher overlay */
    .mode-switcher-overlay {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 20;
      align-items: center; justify-content: center;
    }
    .mode-switcher-overlay.open { display: flex; }

    .mode-switcher {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; width: 340px; max-width: 90vw;
    }
    .mode-switcher h3 {
      font-size: 16px; margin-bottom: 12px; color: var(--text);
    }
    .mode-option {
      padding: 12px; border: 1px solid var(--border); border-radius: var(--radius);
      margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
    }
    .mode-option:hover { border-color: var(--primary); background: var(--primary2); }
    .mode-option.active { border-color: var(--primary); background: var(--primary2); }
    .mode-option-title {
      font-weight: 600; font-size: 14px; margin-bottom: 4px;
    }
    .mode-option-desc {
      font-size: 12px; color: var(--muted); line-height: 1.4;
    }
    .mode-warning {
      margin-top: 12px; padding: 8px 10px;
      background: rgba(250,204,21,0.1); border: 1px solid rgba(250,204,21,0.25);
      border-radius: 6px; font-size: 12px; color: var(--warn);
      display: none;
    }
    .mode-warning.show { display: block; }
    .mode-switcher-actions {
      margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;
    }
    .mode-switcher-actions .btn { padding: 6px 16px; }

    /* Tone theme overrides */
    .tone-friendly { --primary: #ff9f43; --primary2: rgba(255,159,67,0.15); --user-bg: rgba(255,159,67,0.12); --user-bdr: rgba(255,159,67,0.3); }
    .tone-professional { --primary: #48dbfb; --primary2: rgba(72,219,251,0.15); --user-bg: rgba(72,219,251,0.12); --user-bdr: rgba(72,219,251,0.3); }
    .tone-formal { --primary: #a29bfe; --primary2: rgba(162,155,254,0.15); --user-bg: rgba(162,155,254,0.12); --user-bdr: rgba(162,155,254,0.3); }
    .tone-casual { --primary: #6c8cff; --primary2: rgba(108,140,255,0.15); --user-bg: rgba(108,140,255,0.12); --user-bdr: rgba(108,140,255,0.3); }
    .tone-custom { --primary: #ff6b81; --primary2: rgba(255,107,129,0.15); --user-bg: rgba(255,107,129,0.12); --user-bdr: rgba(255,107,129,0.3); }

    /* Responsive */
    @media (min-width: 768px) {
      .sidebar.open { display: flex; }
      .sidebar-toggle-mobile { display: none !important; }
    }
    @media (max-width: 767px) {
      .sidebar.open {
        display: flex; position: fixed; top: 44px; right: 0; bottom: 0;
        z-index: 10; width: 280px;
        box-shadow: -4px 0 20px rgba(0,0,0,0.5);
      }
      .sidebar-toggle-mobile { display: block; }
      .msg { max-width: 90%; }
      .personality-name { display: none; }
      .mode-badge { font-size: 9px; padding: 1px 5px; }
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  </style>
</head>
<body>
  <div id="app">
    <!-- Header -->
    <header>
      <div class="personality-header">
        <span class="personality-emoji" id="personalityEmoji">&#x1F9E0;</span>
        <span class="personality-name" id="personalityName">cocapn</span>
      </div>
      <span class="mode-badge" id="modeBadge">public</span>
      <span class="spacer"></span>
      <button class="btn-icon sidebar-toggle-mobile" id="sidebarToggleMobile" title="Memory">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-.746 0-1.452.2-2.003.557l-1.334-1.334a5 5 0 0 1 0-7.072z"/>
        </svg>
      </button>
      <button class="btn-icon" id="brainToggle" title="Memory Browser">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-.746 0-1.452.2-2.003.557l-1.334-1.334a5 5 0 0 1 0-7.072z"/>
        </svg>
      </button>
      <button class="btn-icon" id="modeToggle" title="Switch Mode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
        </svg>
      </button>
      <button class="btn" id="newSession">New Session</button>
      <div class="status">
        <span class="dot" id="statusDot"></span>
        <span id="statusText">Connecting...</span>
      </div>
    </header>

    <div id="personality-header" class="personality-header" style="display:none">
      <span class="status-dot"></span>
      <div>
        <div class="agent-name" id="agent-name">Cocapn</div>
        <div class="agent-greeting" id="agent-greeting"></div>
      </div>
      <span class="mode-badge private" id="mode-badge">Private</span>
    </div>

    <div class="body">
      <!-- Chat -->
      <div class="chat">
        <div class="messages" id="messages">
          <div class="empty" id="emptyState">
            <div>
              <div class="icon">&#x1F9E0;</div>
              <p class="greeting" id="greetingText"></p>
              <p>Start a conversation</p>
              <p class="hint">Type a message or press Enter to send</p>
            </div>
          </div>
        </div>
        <div class="input-bar">
          <textarea id="input" rows="1" placeholder="Message... (Shift+Enter for newline)"></textarea>
          <button class="send-btn" id="sendBtn" disabled title="Send (Enter)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12zm0 0h7.5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Memory Browser Sidebar -->
      <div class="sidebar" id="sidebar">
        <div class="sidebar-tabs">
          <button class="sidebar-tab active" data-tab="facts">Facts</button>
          <button class="sidebar-tab" data-tab="wiki">Wiki</button>
          <button class="sidebar-tab" data-tab="soul">Soul</button>
        </div>
        <div class="sidebar-content">
          <!-- Facts Panel -->
          <div class="tab-panel active" id="panel-facts">
            <div class="fact-add">
              <input class="fact-key" id="factKeyInput" placeholder="key" />
              <input class="fact-val" id="factValInput" placeholder="value" />
              <button id="factAddBtn" title="Add fact">+</button>
            </div>
            <div class="facts-list" id="factsList">
              <div class="sidebar-empty">Connect to see agent memory</div>
            </div>
          </div>

          <!-- Wiki Panel -->
          <div class="tab-panel" id="panel-wiki">
            <div class="wiki-list-wrapper" id="wikiListWrapper">
              <div class="wiki-search">
                <input id="wikiSearchInput" placeholder="Search wiki pages..." />
              </div>
              <div class="wiki-list" id="wikiList">
                <div class="sidebar-empty">Connect to see wiki</div>
              </div>
            </div>
            <div class="wiki-content" id="wikiContent">
              <div class="wiki-content-back">
                <button id="wikiBackBtn">&larr; Back to wiki list</button>
              </div>
              <div class="wiki-content-body" id="wikiContentBody"></div>
            </div>
          </div>

          <!-- Soul Panel -->
          <div class="tab-panel" id="panel-soul">
            <div class="soul-content" id="soulContent">
              <div class="sidebar-empty">Connect to see agent soul</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode Switcher Overlay -->
    <div class="mode-switcher-overlay" id="modeSwitcherOverlay">
      <div class="mode-switcher">
        <h3>Switch Mode</h3>
        <div class="mode-option" id="modeOptionPublic" data-mode="public">
          <div class="mode-option-title">Public Mode</div>
          <div class="mode-option-desc">Public-facing chat. Facts prefixed with "private.*" are hidden. Suitable for visitors.</div>
        </div>
        <div class="mode-option" id="modeOptionPrivate" data-mode="private">
          <div class="mode-option-title">Private Mode</div>
          <div class="mode-option-desc">Full brain access. All facts, wiki, and private data visible. Requires authentication.</div>
        </div>
        <div class="mode-warning" id="modeWarning">
          Switching to public mode will hide all private.* facts from the conversation.
        </div>
        <div class="mode-switcher-actions">
          <button class="btn" id="modeCancel">Cancel</button>
          <button class="btn" id="modeApply">Apply</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // ─── State ──────────────────────────────────────────────────────────────────
    // Derive WebSocket URL from current page origin (works locally and on worker)
    const WS_URL = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;
    let ws = null;
    let msgSeq = 0;
    let reconnectTimer = null;
    let streamingId = null;
    const facts = new Map();
    let wikiPages = [];
    let activeWikiFile = null;
    let activeTab = 'facts';
    let sidebarOpen = window.innerWidth >= 768;
    let currentMode = 'public';
    let selectedMode = 'public';
    let agentName = '';
    let agentEmoji = '\\u{1F9E0}';
    let agentGreeting = '';

    // ─── DOM refs ───────────────────────────────────────────────────────────────
    const $messages      = document.getElementById('messages');
    const $emptyState    = document.getElementById('emptyState');
    const $input         = document.getElementById('input');
    const $sendBtn       = document.getElementById('sendBtn');
    const $statusDot     = document.getElementById('statusDot');
    const $statusText    = document.getElementById('statusText');
    const $newSession    = document.getElementById('newSession');
    const $sidebar       = document.getElementById('sidebar');
    const $brainToggle   = document.getElementById('brainToggle');
    const $sidebarMobile = document.getElementById('sidebarToggleMobile');
    const $factsList     = document.getElementById('factsList');
    const $factKeyInput  = document.getElementById('factKeyInput');
    const $factValInput  = document.getElementById('factValInput');
    const $factAddBtn    = document.getElementById('factAddBtn');
    const $wikiList      = document.getElementById('wikiList');
    const $wikiListWrapper = document.getElementById('wikiListWrapper');
    const $wikiSearchInput = document.getElementById('wikiSearchInput');
    const $wikiContent   = document.getElementById('wikiContent');
    const $wikiContentBody = document.getElementById('wikiContentBody');
    const $wikiBackBtn   = document.getElementById('wikiBackBtn');
    const $soulContent   = document.getElementById('soulContent');
    const $personalityEmoji = document.getElementById('personalityEmoji');
    const $personalityName = document.getElementById('personalityName');
    const $modeBadge     = document.getElementById('modeBadge');
    const $modeToggle    = document.getElementById('modeToggle');
    const $modeSwitcherOverlay = document.getElementById('modeSwitcherOverlay');
    const $modeOptionPublic = document.getElementById('modeOptionPublic');
    const $modeOptionPrivate = document.getElementById('modeOptionPrivate');
    const $modeWarning   = document.getElementById('modeWarning');
    const $modeCancel    = document.getElementById('modeCancel');
    const $modeApply     = document.getElementById('modeApply');
    const $greetingText  = document.getElementById('greetingText');

    // ─── Personality Header ────────────────────────────────────────────────────
    function applyPersonality(data) {
      if (data.soul) {
        agentName = data.soul.name || '';
        agentEmoji = data.soul.emoji || '\\u{1F9E0}';
        agentGreeting = data.soul.greeting || '';

        if (agentName) {
          $personalityName.textContent = agentName;
          document.title = agentName + ' \\u2014 cocapn';
        }
        $personalityEmoji.textContent = agentEmoji;
        if (agentGreeting && $greetingText) {
          $greetingText.textContent = agentGreeting;
        }
      }

      // Apply tone-based color theme
      if (data.soul && data.soul.tone) {
        const tone = data.soul.tone.toLowerCase();
        document.body.classList.remove('tone-friendly', 'tone-professional', 'tone-formal', 'tone-casual', 'tone-custom');
        if (['friendly', 'professional', 'formal', 'casual', 'custom'].includes(tone)) {
          document.body.classList.add('tone-' + tone);
        }
      }

      // Update mode from status
      if (data.mode) {
        currentMode = data.mode;
        updateModeBadge();
      }
    }

    // Fetch personality from /api/status
    async function loadPersonality() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.soul && data.soul.greeting) {
          agentName = data.soul.name || 'Cocapn';
          document.getElementById('agent-name').textContent = agentName;
          document.getElementById('agent-greeting').textContent = data.soul.greeting;
          document.getElementById('personality-header').style.display = 'flex';
        }
        if (data.mode) {
          const badge = document.getElementById('mode-badge');
          badge.textContent = data.mode;
          badge.className = 'mode-badge ' + data.mode;
        }
      } catch(e) { /* offline */ }
    }

    function fetchPersonality() {
      fetch('/api/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.ok !== undefined) {
            applyPersonality(data);
            setStatus(data.ok ? 'on' : '', data.ok ? 'Online' : 'Degraded');
          }
        })
        .catch(function() {
          // Status endpoint unavailable — use defaults
        });
    }

    function updateModeBadge() {
      $modeBadge.textContent = currentMode;
      $modeBadge.classList.toggle('private-mode', currentMode === 'private');
    }

    // ─── Mode Switcher ─────────────────────────────────────────────────────────
    function openModeSwitcher() {
      selectedMode = currentMode;
      $modeOptionPublic.classList.toggle('active', selectedMode === 'public');
      $modeOptionPrivate.classList.toggle('active', selectedMode === 'private');
      $modeWarning.classList.remove('show');
      $modeSwitcherOverlay.classList.add('open');
    }

    function closeModeSwitcher() {
      $modeSwitcherOverlay.classList.remove('open');
    }

    function selectMode(mode) {
      selectedMode = mode;
      $modeOptionPublic.classList.toggle('active', mode === 'public');
      $modeOptionPrivate.classList.toggle('active', mode === 'private');
      // Show warning when switching from private to public
      $modeWarning.classList.toggle('show', currentMode === 'private' && mode === 'public');
    }

    function applyMode() {
      currentMode = selectedMode;
      updateModeBadge();
      closeModeSwitcher();
      // Notify server of mode change via WebSocket if available
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'MODE_SET', id: rpcId(), mode: currentMode }));
      }
    }

    $modeToggle.addEventListener('click', openModeSwitcher);
    $modeCancel.addEventListener('click', closeModeSwitcher);
    $modeApply.addEventListener('click', applyMode);
    $modeOptionPublic.addEventListener('click', function() { selectMode('public'); });
    $modeOptionPrivate.addEventListener('click', function() { selectMode('private'); });
    $modeSwitcherOverlay.addEventListener('click', function(e) {
      if (e.target === $modeSwitcherOverlay) closeModeSwitcher();
    });

    // ─── Helpers ───────────────────────────────────────────────────────────────
    function nextId() { return 'msg-' + (++msgSeq); }
    function rpcId() { return 'rpc-' + Date.now() + '-' + (++msgSeq); }

    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function formatText(text) {
      let html = escapeHtml(text);
      // Code blocks with language label and copy button
      html = html.replace(/\\\`\\\`\\\`(\\w*)\\n?([\\s\\S]*?)\\\`\\\`\\\`/g, function(match, lang, code) {
        const langLabel = lang ? '<span class="code-block-label">' + escapeHtml(lang) + '</span>' : '';
        const escapedCode = code.replace(/\\n$/, '');
        return '<div class="code-block-wrapper">'
          + langLabel
          + '<button class="code-copy-btn" onclick="copyCodeBlock(this)">Copy</button>'
          + '<pre><code>' + escapedCode + '</code></pre>'
          + '</div>';
      });
      html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
      return html;
    }

    function copyCodeBlock(btn) {
      var wrapper = btn.parentElement;
      var code = wrapper.querySelector('code');
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    }

    function formatMarkdown(text) {
      let html = escapeHtml(text);
      // Headings
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Code blocks with language label and copy button
      html = html.replace(/\\\`\\\`\\\`(\\w*)\\n?([\\s\\S]*?)\\\`\\\`\\\`/g, function(match, lang, code) {
        const langLabel = lang ? '<span class="code-block-label">' + escapeHtml(lang) + '</span>' : '';
        const escapedCode = code.replace(/\\n$/, '');
        return '<div class="code-block-wrapper">'
          + langLabel
          + '<button class="code-copy-btn" onclick="copyCodeBlock(this)">Copy</button>'
          + '<pre><code>' + escapedCode + '</code></pre>'
          + '</div>';
      });
      // Inline code
      html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
      // Bold
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/[^*]\\*([^*]+)\\*/g, ' <em>$1</em>');
      return html;
    }

    function scrollBottom() {
      $messages.scrollTop = $messages.scrollHeight;
    }

    // ─── Status ────────────────────────────────────────────────────────────────
    function setStatus(state, text) {
      $statusDot.className = 'dot' + (state === 'on' ? ' on' : state === 'warn' ? ' warn' : '');
      $statusText.textContent = text;
    }

    // ─── Sidebar Toggle ───────────────────────────────────────────────────────
    function toggleSidebar() {
      sidebarOpen = !sidebarOpen;
      $sidebar.classList.toggle('open', sidebarOpen);
      $brainToggle.classList.toggle('active', sidebarOpen);
      if (sidebarOpen) fetchAll();
    }

    function openSidebar() {
      sidebarOpen = true;
      $sidebar.classList.add('open');
      $brainToggle.classList.add('active');
      fetchAll();
    }

    function closeSidebar() {
      sidebarOpen = false;
      $sidebar.classList.remove('open');
      $brainToggle.classList.remove('active');
    }

    // ─── Tab Switching ────────────────────────────────────────────────────────
    function switchTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.sidebar-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === tab);
      });
      document.querySelectorAll('.tab-panel').forEach(function(p) {
        p.classList.toggle('active', p.id === 'panel-' + tab);
      });
      if (tab === 'wiki') {
        showWikiList();
      }
    }

    // ─── Messages ──────────────────────────────────────────────────────────────
    function addMessage(role, content, agentId) {
      if ($emptyState) $emptyState.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.dataset.id = streamingId || nextId();

      let inner = '<div class="bubble">';
      if (role === 'agent') {
        const label = agentName || document.getElementById('agent-name').textContent || agentId || 'Assistant';
        inner += '<div class="agent-label">' + escapeHtml(label) + '</div>';
      }
      inner += formatText(content);
      inner += '</div>';
      div.innerHTML = inner;

      $messages.appendChild(div);
      scrollBottom();
      return div;
    }

    function appendToLast(chunk) {
      const msgs = $messages.querySelectorAll('.msg.agent');
      const last = msgs[msgs.length - 1];
      if (!last) return addMessage('agent', chunk);
      const bubble = last.querySelector('.bubble');
      const typing = bubble.querySelector('.typing');
      if (typing) typing.remove();
      bubble.innerHTML += formatText(chunk);
      scrollBottom();
    }

    function showTyping() {
      const msgs = $messages.querySelectorAll('.msg.agent');
      const last = msgs[msgs.length - 1];
      if (!last) return;
      const bubble = last.querySelector('.bubble');
      if (bubble.querySelector('.typing')) return;
      const typingLabel = agentName ? agentName + ' is thinking' : '';
      bubble.innerHTML += '<span class="typing"><span></span><span></span><span></span></span>';
      scrollBottom();
    }

    function finishStreaming(usage) {
      const msgs = $messages.querySelectorAll('.msg.agent');
      const last = msgs[msgs.length - 1];
      if (!last) return;
      const bubble = last.querySelector('.bubble');
      const typing = bubble.querySelector('.typing');
      if (typing) typing.remove();
      if (usage) {
        const info = document.createElement('div');
        info.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono)';
        const parts = [];
        if (usage.inputTokens)  parts.push('in:' + usage.inputTokens);
        if (usage.outputTokens) parts.push('out:' + usage.outputTokens);
        if (parts.length) info.textContent = parts.join(' \\u00b7 ');
        bubble.appendChild(info);
      }
      streamingId = null;
      $input.disabled = false;
      $input.focus();
    }

    // ─── Facts ─────────────────────────────────────────────────────────────────
    function renderFacts() {
      if (facts.size === 0) {
        $factsList.innerHTML = '<div class="sidebar-empty">No facts stored yet</div>';
        return;
      }
      let html = '';
      for (const [key, val] of facts) {
        html += '<div class="fact-chip">'
          + '<span class="chip-key" title="' + escapeHtml(key) + '">' + escapeHtml(key) + '</span>'
          + '<span class="chip-sep">:</span>'
          + '<span class="chip-val" title="' + escapeHtml(String(val)) + '">' + escapeHtml(String(val)) + '</span>'
          + '<button class="chip-del" data-key="' + escapeHtml(key) + '" title="Delete">&times;</button>'
          + '</div>';
      }
      $factsList.innerHTML = html;

      $factsList.querySelectorAll('.chip-del').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteFact(btn.dataset.key);
        });
      });
    }

    function fetchFacts() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'MEMORY_LIST', id: rpcId() }));
    }

    function addFact(key, value) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'MEMORY_ADD', id: rpcId(), key: key, value: value }));
    }

    function deleteFact(key) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'MEMORY_DELETE', id: rpcId(), key: key }));
    }

    // ─── Wiki ──────────────────────────────────────────────────────────────────
    function renderWikiList(filter) {
      if (wikiPages.length === 0) {
        $wikiList.innerHTML = '<div class="sidebar-empty">No wiki pages yet</div>';
        return;
      }
      const q = (filter || '').toLowerCase().trim();
      const filtered = q
        ? wikiPages.filter(function(p) { return p.title.toLowerCase().includes(q) || p.file.toLowerCase().includes(q); })
        : wikiPages;

      if (filtered.length === 0) {
        $wikiList.innerHTML = '<div class="sidebar-empty">No matching pages</div>';
        return;
      }

      let html = '';
      for (const page of filtered) {
        html += '<div class="wiki-item" data-file="' + escapeHtml(page.file) + '">'
          + '<div class="wiki-title">' + escapeHtml(page.title) + '</div>'
          + '<div class="wiki-file">' + escapeHtml(page.file) + '</div>'
          + '</div>';
      }
      $wikiList.innerHTML = html;

      $wikiList.querySelectorAll('.wiki-item').forEach(function(item) {
        item.addEventListener('click', function() {
          readWikiPage(item.dataset.file);
        });
      });
    }

    function showWikiList() {
      $wikiListWrapper.style.display = '';
      $wikiContent.classList.remove('active');
      activeWikiFile = null;
    }

    function showWikiContent(file, content) {
      activeWikiFile = file;
      $wikiListWrapper.style.display = 'none';
      $wikiContent.classList.add('active');
      $wikiContentBody.innerHTML = formatMarkdown(content);
    }

    function fetchWikiPages() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'WIKI_LIST', id: rpcId() }));
    }

    function readWikiPage(file) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'WIKI_READ', id: rpcId(), file: file }));
    }

    // ─── Soul ──────────────────────────────────────────────────────────────────
    function renderSoul(content) {
      if (!content) {
        $soulContent.innerHTML = '<div class="sidebar-empty">No soul.md found</div>';
        return;
      }
      $soulContent.innerHTML = formatMarkdown(content);
    }

    function fetchSoul() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'SOUL_GET', id: rpcId() }));
    }

    // ─── Fetch All ─────────────────────────────────────────────────────────────
    function fetchAll() {
      fetchFacts();
      fetchWikiPages();
      fetchSoul();
    }

    // ─── WebSocket ─────────────────────────────────────────────────────────────
    function connect() {
      setStatus('warn', 'Connecting...');
      try {
        ws = new WebSocket(WS_URL);
      } catch (e) {
        setStatus('', 'Disconnected');
        scheduleReconnect();
        return;
      }

      ws.onopen = function() {
        setStatus('on', 'Connected');
        if (sidebarOpen) fetchAll();
      };

      ws.onclose = function() {
        setStatus('', 'Disconnected');
        streamingId = null;
        scheduleReconnect();
      };

      ws.onerror = function() {};

      ws.onmessage = function(event) {
        let data;
        try { data = JSON.parse(event.data); } catch(e) { return; }

        if (data.type === 'MEMORY_LIST' && Array.isArray(data.facts)) {
          facts.clear();
          for (const f of data.facts) {
            if (f && f.key) facts.set(f.key, f.value ?? '');
          }
          renderFacts();
          return;
        }

        if (data.type === 'MEMORY_ADD' && data.ok) {
          facts.set(data.key, data.value);
          renderFacts();
          $factKeyInput.value = '';
          $factValInput.value = '';
          $factKeyInput.focus();
          return;
        }

        if (data.type === 'MEMORY_DELETE' && data.ok) {
          facts.delete(data.key);
          renderFacts();
          return;
        }

        if (data.type === 'WIKI_LIST' && Array.isArray(data.pages)) {
          wikiPages = data.pages;
          renderWikiList($wikiSearchInput.value);
          return;
        }

        if (data.type === 'WIKI_READ' && data.content !== undefined) {
          showWikiContent(data.file, data.content);
          return;
        }

        if (data.type === 'SOUL_GET' && data.content !== undefined) {
          renderSoul(data.content);
          return;
        }

        if (data.jsonrpc === '2.0' && data.result !== undefined) {
          if (data.id && String(data.id).startsWith('facts-') && Array.isArray(data.result)) {
            facts.clear();
            for (const f of data.result) {
              if (f && f.key) facts.set(f.key, f.value ?? '');
            }
            renderFacts();
          }
          if (data.result && data.result.type === 'content') {
            appendToLast(data.result.text);
          }
          if (data.result && data.result.type === 'done') {
            finishStreaming(data.result.usage);
          }
          return;
        }

        if (data.type === 'CHAT_STREAM') {
          if (data.id && !data.done && !streamingId) {
            const existing = $messages.querySelector('.msg[data-id="' + data.id + '"]');
            if (!existing) {
              addMessage('agent', data.chunk, data.agentId);
              const msgs = $messages.querySelectorAll('.msg.agent');
              msgs[msgs.length - 1].dataset.id = data.id;
            } else {
              appendToLast(data.chunk);
            }
          } else if (data.chunk) {
            appendToLast(data.chunk);
          }
          if (data.done) {
            if (data.error) {
              appendToLast('\\n' + data.error);
            }
            finishStreaming();
          }
          return;
        }

        if (data.type === 'fact.remembered' || data.type === 'FACT_UPDATE') {
          if (data.fact && data.fact.key) {
            facts.set(data.fact.key, data.fact.value ?? '');
            renderFacts();
          }
          return;
        }
      };
    }

    function scheduleReconnect() {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    }

    // ─── Send ──────────────────────────────────────────────────────────────────
    function send() {
      const text = $input.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

      $input.value = '';
      $input.style.height = 'auto';
      $sendBtn.disabled = true;

      addMessage('user', text);

      if ($emptyState) $emptyState.style.display = 'none';
      streamingId = nextId();
      const agentDiv = document.createElement('div');
      agentDiv.className = 'msg agent';
      agentDiv.dataset.id = streamingId;
      agentDiv.innerHTML = '<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>';
      $messages.appendChild(agentDiv);
      scrollBottom();

      $input.disabled = true;

      ws.send(JSON.stringify({
        type: 'CHAT',
        id: streamingId,
        content: text,
        agentId: 'claude'
      }));
    }

    // ─── New Session ───────────────────────────────────────────────────────────
    function newSession() {
      $messages.innerHTML = '';
      if ($emptyState) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.id = 'emptyState';
        const greetingHtml = agentGreeting
          ? '<p class="greeting">' + escapeHtml(agentGreeting) + '</p>'
          : '';
        empty.innerHTML = '<div>'
          + '<div class="icon">' + escapeHtml(agentEmoji) + '</div>'
          + greetingHtml
          + '<p>Start a conversation</p>'
          + '<p class="hint">Type a message or press Enter to send</p>'
          + '</div>';
        $messages.appendChild(empty);
      }
      streamingId = null;
      $input.disabled = false;
      $input.focus();
    }

    // ─── Event listeners ───────────────────────────────────────────────────────
    $input.addEventListener('input', function() {
      $sendBtn.disabled = !$input.value.trim();
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 140) + 'px';
    });

    $input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    $sendBtn.addEventListener('click', send);
    $newSession.addEventListener('click', newSession);

    $brainToggle.addEventListener('click', toggleSidebar);
    $sidebarMobile.addEventListener('click', toggleSidebar);

    document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
      tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
    });

    function handleAddFact() {
      const key = $factKeyInput.value.trim();
      const val = $factValInput.value.trim();
      if (!key || !val) return;
      addFact(key, val);
    }

    $factAddBtn.addEventListener('click', handleAddFact);
    $factValInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddFact();
      }
    });
    $factKeyInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $factValInput.focus();
      }
    });

    $wikiSearchInput.addEventListener('input', function() {
      renderWikiList($wikiSearchInput.value);
    });

    $wikiBackBtn.addEventListener('click', showWikiList);

    if (window.innerWidth >= 768) {
      openSidebar();
    }

    // ─── Init ──────────────────────────────────────────────────────────────────
    loadPersonality();
    fetchPersonality();
    connect();
    $input.focus();
  </script>
</body>
</html>`;
