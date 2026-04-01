# Cocapn — VS Code Extension

**The repo IS the agent.** This extension connects your editor to a running cocapn agent for real-time code understanding, refactoring suggestions, test generation, and more.

## Features

### Chat Sidebar
A webview panel in the activity bar for chatting with your cocapn agent. Supports streaming responses, markdown code blocks, and session history.

### Status Bar
Shows agent connection status, name, and memory count at a glance. Click to open chat.

### Commands (Ctrl+Shift+P)
| Command | What it does |
|---------|-------------|
| `Cocapn: Explain this file` | Sends current file to agent for explanation |
| `Cocapn: What changed here?` | Sends git diff of current file for analysis |
| `Cocapn: How should I refactor this?` | Context-aware refactoring suggestions |
| `Cocapn: What are the implications of changing this?` | Impact analysis for selected code |
| `Cocapn: Generate tests for this` | Test generation for current file/selection |
| `Cocapn: Show repo status` | Agent's view of the repository |
| `Cocapn: Open chat` | Focus the chat sidebar |

### Context Menu (Right-click in Editor)
- **Ask cocapn about this code** — ask a custom question about selected code
- **Explain this function** — detailed function explanation
- **Find related code** — discover related files and modules
- **Get refactoring suggestions** — prioritized improvement ideas

### File Watcher
Automatically notifies the agent when files are created, modified, or deleted. The agent stays aware of repo changes and can proactively suggest improvements.

### Language Features
- **Hover**: Hover over a symbol to see the agent's explanation
- **Diagnostics**: Agent suggestions shown as editor warnings/info

### Terminal Integration
Agent-suggested commands appear as notifications. Approve to run in a dedicated terminal, or copy to clipboard.

## Installation

### From Source
```bash
cd packages/vscode-extension
npm install
npm run compile
npx vsce package
# Install the .vsix in VS Code: Extensions > ... > Install from VSIX
```

### Development
```bash
npm run watch  # Auto-compile on file changes
```

Press F5 in VS Code to launch the Extension Development Host.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `cocapn.serverUrl` | `http://localhost:3100` | URL of the cocapn bridge server |
| `cocapn.apiKey` | `""` | API key for the bridge |
| `cocapn.autoWatch` | `true` | Notify agent on file changes |
| `cocapn.enableDiagnostics` | `true` | Show agent suggestions as diagnostics |

## Requirements

- VS Code 1.85+
- A running cocapn bridge (start with `cocapn start` or `npx cocapn start`)

## Architecture

The extension uses pure VS Code APIs — no external dependencies:
- **WebviewViewProvider** for the sidebar chat
- **StatusBarItem** for connection status
- **FileSystemWatcher** for file change detection
- **HoverProvider** for symbol explanations
- **DiagnosticCollection** for agent suggestions
- **fetch()** for HTTP communication with the bridge

All communication goes through the cocapn bridge's REST API (`/api/chat`, `/api/status`, `/api/file-event`, `/api/hover`, `/api/mcp/*`).
