# Minimal Agent

A 20-line cocapn agent that responds to chat messages.

## Usage

```bash
npx tsx index.ts
```

## Code

```typescript
import { BridgeServer } from '../../packages/local-bridge/src/bridge.js';
import { DeepSeekProvider } from '../../packages/local-bridge/src/llm/deepseek.js';

const bridge = new BridgeServer({
  port: 3100,
  llm: new DeepSeekProvider({
    apiKey: process.env.DEEPSEEK_API_KEY,
  }),
});

await bridge.start();
console.log('Agent running at ws://localhost:3100');
console.log('Open packages/ui-minimal/index.html to chat');
```

## What it does
1. Creates a bridge server with DeepSeek as the LLM
2. Starts WebSocket server on port 3100
3. You can chat with it via the minimal UI or any WebSocket client
