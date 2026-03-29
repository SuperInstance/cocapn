# @cocapn/protocols

MCP (Model Context Protocol), A2A (Agent-to-Agent), and Fleet protocol implementations for cocapn.

## Install

```bash
npm install @cocapn/protocols
```

## Usage

### MCP Server

```typescript
import { McpServer } from '@cocapn/protocols/mcp';

const server = new McpServer({
  name: 'my-agent',
  version: '1.0.0',
});

// Register a tool
server.tool('greet', { name: 'string' }, async ({ name }) => ({
  content: [{ type: 'text', text: `Hello, ${name}!` }],
}));

// Start the server
server.start(3001);
```

### A2A Client

```typescript
import { A2AClient } from '@cocapn/protocols/a2a';

const client = new A2AClient('https://other-agent.example.com');
await client.connect();
const response = await client.send({ type: 'task', payload: { task: 'review code' } });
```

## API

See [docs/site/api-reference.html](../../docs/site/api-reference.html) for full API documentation.

## License

MIT
