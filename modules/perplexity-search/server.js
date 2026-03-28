#!/usr/bin/env node
/**
 * perplexity-search MCP server
 *
 * Tools:
 *   search(query, recency?)   — web search via Perplexity Sonar API
 *   deep_search(query)        — deeper research with citations
 *
 * Requires PERPLEXITY_API_KEY env var (set in secrets/ or via wrangler secret).
 */

const PERPLEXITY_API = "https://api.perplexity.ai/chat/completions";
const API_KEY = process.env.PERPLEXITY_API_KEY ?? "";

async function search(query, recency = "month", model = "sonar") {
  if (!API_KEY) return { error: "PERPLEXITY_API_KEY not set. Add it to secrets/perplexity.yml" };

  const body = {
    model,
    messages: [{ role: "user", content: query }],
    search_recency_filter: recency,
    return_citations: true,
  };

  const res = await fetch(PERPLEXITY_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `Perplexity API error ${res.status}: ${text}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const citations = data.citations ?? [];
  return { content, citations };
}

// ── MCP protocol ─────────────────────────────────────────────────────────────

function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

const TOOLS = [
  {
    name: "search",
    description: "Search the web with Perplexity AI for up-to-date information",
    inputSchema: {
      type: "object",
      properties: {
        query:   { type: "string", description: "Search query" },
        recency: { type: "string", enum: ["hour","day","week","month","year",""], description: "Recency filter" },
      },
      required: ["query"],
    },
  },
  {
    name: "deep_search",
    description: "In-depth research using Perplexity sonar-pro with citations",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Research query" },
      },
      required: ["query"],
    },
  },
];

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }

    if (req.method === "initialize") {
      send({ jsonrpc: "2.0", id: req.id, result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "perplexity-search", version: "1.0.0" },
        capabilities: { tools: {} },
      }});
    } else if (req.method === "tools/list") {
      send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });
    } else if (req.method === "tools/call") {
      const { name, arguments: args = {} } = req.params;
      (async () => {
        let result;
        if (name === "search") {
          result = await search(args.query, args.recency ?? "month");
        } else if (name === "deep_search") {
          result = await search(args.query, "year", "sonar-pro");
        } else {
          result = { error: `Unknown tool: ${name}` };
        }
        send({ jsonrpc: "2.0", id: req.id, result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        }});
      })().catch((err) => send({ jsonrpc: "2.0", id: req.id, error: { code: -32603, message: err.message } }));
    } else {
      send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } });
    }
  }
});
