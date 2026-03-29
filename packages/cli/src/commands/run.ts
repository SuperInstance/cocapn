/**
 * cocapn run — Non-interactive single-shot agent execution for CI/CD
 *
 * Takes a task description, builds repo context, calls an LLM,
 * and outputs the result to stdout. Exit 0 on success, 1 on error.
 */

import { Command } from "commander";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

interface RunOptions {
  task: string;
  model: string;
  maxTokens: number;
  apiBase: string;
  apiKey?: string;
  workingDirectory: string;
  context: string;
}

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

function buildRepoContext(workingDir: string, contextType: string): string {
  const parts: string[] = [];

  // Directory structure
  try {
    const tree = execSync("find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' | head -200", {
      cwd: workingDir,
      encoding: "utf-8",
      timeout: 10000,
    });
    if (tree.trim()) {
      parts.push("## Repository Structure\n```\n" + tree.trim() + "\n```");
    }
  } catch {
    // Fallback to ls
    try {
      const ls = execSync("ls -la", { cwd: workingDir, encoding: "utf-8", timeout: 5000 });
      parts.push("## Directory Listing\n```\n" + ls.trim() + "\n```");
    } catch {
      // Skip if nothing works
    }
  }

  // Git diff (for PR contexts)
  if (contextType === "diff" || contextType === "full") {
    try {
      const diff = execSync("git diff HEAD~1 --stat 2>/dev/null || git diff --stat 2>/dev/null", {
        cwd: workingDir,
        encoding: "utf-8",
        timeout: 10000,
      });
      if (diff.trim()) {
        parts.push("## Recent Changes\n```\n" + diff.trim() + "\n```");
      }
    } catch {
      // No git or no diff
    }
  }

  // Git log
  if (contextType === "full") {
    try {
      const log = execSync("git log --oneline -20", {
        cwd: workingDir,
        encoding: "utf-8",
        timeout: 5000,
      });
      if (log.trim()) {
        parts.push("## Recent Commits\n```\n" + log.trim() + "\n```");
      }
    } catch {
      // No git
    }
  }

  // Config files
  const configFiles = ["package.json", "cocapn.yml", "README.md", "CLAUDE.md", "tsconfig.json"];
  for (const file of configFiles) {
    const filePath = join(workingDir, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8").slice(0, 2000);
        parts.push(`## ${file}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : "No repository context available.";
}

async function callLLM(options: RunOptions, repoContext: string): Promise<string> {
  const apiKey = options.apiKey || process.env.COCAPN_API_KEY;
  if (!apiKey) {
    throw new Error("API key required. Set COCAPN_API_KEY env var or pass --api-key.");
  }

  const systemPrompt = [
    "You are a cocapn agent running in CI/CD. Analyze the repository context and complete the task.",
    "Be concise and actionable. If reviewing code, note specific issues with file paths and line references.",
    "Output plain text or markdown.",
  ].join("\n");

  const userPrompt = [
    `## Task\n${options.task}`,
    "",
    repoContext,
  ].join("\n");

  const url = `${options.apiBase}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: options.maxTokens,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  if (data.choices?.[0]?.message?.content) {
    // Print usage stats to stderr so they don't interfere with stdout
    if (data.usage) {
      process.stderr.write(`[cocapn] tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})\n`);
    }
    return data.choices[0].message.content;
  }

  throw new Error("No response content from LLM");
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Run a single-shot agent task (non-interactive, CI-friendly)")
    .requiredOption("--task <task>", "Task description for the agent")
    .option("--model <model>", "LLM model to use", "deepseek-chat")
    .option("--max-tokens <tokens>", "Max tokens for response", "4096")
    .option("--api-base <url>", "LLM API base URL", "https://api.deepseek.com")
    .option("--api-key <key>", "LLM API key (or set COCAPN_API_KEY)")
    .option("-w, --working-directory <dir>", "Working directory", process.cwd())
    .option("--context <type>", "Context level: minimal, diff, full", "diff")
    .action(async (options) => {
      const workingDir = resolve(options.workingDirectory);

      try {
        process.stderr.write(`[cocapn] Building context from ${workingDir}...\n`);

        const repoContext = buildRepoContext(workingDir, options.context);
        process.stderr.write(`[cocapn] Context: ${repoContext.length} bytes\n`);
        process.stderr.write(`[cocapn] Calling ${options.model}...\n`);

        const result = await callLLM(
          {
            task: options.task,
            model: options.model,
            maxTokens: parseInt(options.maxTokens, 10),
            apiBase: options.apiBase,
            apiKey: options.apiKey,
            workingDirectory: workingDir,
            context: options.context,
          },
          repoContext,
        );

        process.stdout.write(result + "\n");
        process.exit(0);
      } catch (err) {
        process.stderr.write(
          `${colors.red}✗ Error:${colors.reset} ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
      }
    });
}
