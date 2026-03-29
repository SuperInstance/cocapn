# Minimal MCP Client

Connect to any MCP server and call its tools.

## Usage

```bash
npx tsx index.ts <server-url>
```

## Code

```typescript
import { McpClient } from '../../packages/protocols/src/mcp/client.js';

const serverUrl = process.argv[2] || 'http://localhost:3001';

const client = new McpClient({ url: serverUrl });
await client.connect();

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools.map(t => t.name));

// Call a tool
const result = await client.callTool('greet', { name: 'World' });
console.log('Result:', result);

await client.disconnect();
```

## What it does
1. Connects to an MCP server
2. Lists all available tools
3. Calls a tool with arguments
4. Prints the result
