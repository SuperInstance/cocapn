#!/usr/bin/env node
/**
 * habit-tracker agent — MCP server that tracks daily habits in wiki/habits.md
 *
 * Tools exposed:
 *   log_habit(name, done)    — mark a habit done/skipped for today
 *   list_habits()            — list today's habits and completion status
 *   add_habit(name, freq)    — add a new habit to track (daily/weekly)
 *   remove_habit(name)       — remove a habit
 *   streak(name)             — return current streak for a habit
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const HABITS_FILE = join(REPO_ROOT, "wiki", "habits.md");
const HABITS_DATA = join(REPO_ROOT, "modules", "habit-tracker", "habits.json");

// ── MCP stdio transport ───────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function readHabitsData() {
  if (!existsSync(HABITS_DATA)) return { habits: [], log: {} };
  try {
    return JSON.parse(readFileSync(HABITS_DATA, "utf8"));
  } catch {
    return { habits: [], log: {} };
  }
}

function writeHabitsData(data) {
  mkdirSync(join(REPO_ROOT, "modules", "habit-tracker"), { recursive: true });
  writeFileSync(HABITS_DATA, JSON.stringify(data, null, 2), "utf8");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateWiki(data) {
  mkdirSync(join(REPO_ROOT, "wiki"), { recursive: true });
  const today = todayKey();
  const todayLog = data.log[today] ?? {};
  const lines = [
    `# Habit Tracker\n`,
    `## Today — ${today}\n`,
    ...data.habits.map((h) => {
      const done = todayLog[h.name];
      const icon = done === true ? "✓" : done === false ? "✗" : "○";
      return `- ${icon} ${h.name}  (${h.freq})`;
    }),
    `\n---\n`,
    `*Updated automatically by habit-tracker agent.*\n`,
  ];
  writeFileSync(HABITS_FILE, lines.join("\n"), "utf8");
}

function calcStreak(data, name) {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (data.log[key]?.[name] !== true) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

function dispatch(tool, args) {
  const data = readHabitsData();

  if (tool === "list_habits") {
    const today = todayKey();
    const log = data.log[today] ?? {};
    return {
      habits: data.habits.map((h) => ({
        name: h.name,
        freq: h.freq,
        done: log[h.name] ?? null,
        streak: calcStreak(data, h.name),
      })),
      date: today,
    };
  }

  if (tool === "log_habit") {
    const { name, done = true } = args;
    const today = todayKey();
    data.log[today] = data.log[today] ?? {};
    data.log[today][name] = done;
    writeHabitsData(data);
    updateWiki(data);
    return { ok: true, name, done, streak: calcStreak(data, name) };
  }

  if (tool === "add_habit") {
    const { name, freq = "daily" } = args;
    if (data.habits.find((h) => h.name === name)) {
      return { ok: false, error: `Habit "${name}" already exists` };
    }
    data.habits.push({ name, freq });
    writeHabitsData(data);
    updateWiki(data);
    return { ok: true, name, freq };
  }

  if (tool === "remove_habit") {
    const { name } = args;
    data.habits = data.habits.filter((h) => h.name !== name);
    writeHabitsData(data);
    updateWiki(data);
    return { ok: true, name };
  }

  if (tool === "streak") {
    const { name } = args;
    return { name, streak: calcStreak(data, name) };
  }

  return { error: `Unknown tool: ${tool}` };
}

// ── MCP protocol loop ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "log_habit",
    description: "Mark a habit as done or skipped for today",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Habit name" },
        done: { type: "boolean", description: "true = done, false = skipped" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_habits",
    description: "List all habits and today's completion status",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_habit",
    description: "Add a new habit to track",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        freq: { type: "string", enum: ["daily", "weekly"], default: "daily" },
      },
      required: ["name"],
    },
  },
  {
    name: "remove_habit",
    description: "Remove a habit",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "streak",
    description: "Get current streak count for a habit",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
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
      send({
        jsonrpc: "2.0", id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "habit-tracker", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      });
    } else if (req.method === "tools/list") {
      send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });
    } else if (req.method === "tools/call") {
      const { name, arguments: args = {} } = req.params;
      const result = dispatch(name, args);
      send({
        jsonrpc: "2.0", id: req.id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
      });
    } else {
      send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } });
    }
  }
});
