/**
 * Simple readline-based prompts — zero external dependencies.
 */

import { createInterface } from "readline";

let _rl: ReturnType<typeof createInterface> | undefined;

function getRL(): ReturnType<typeof createInterface> {
  if (!_rl) {
    _rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return _rl;
}

export function closePrompts(): void {
  _rl?.close();
  _rl = undefined;
}

/**
 * Prompt for a single line of input.
 */
export function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt with masked input (e.g. for tokens/passwords).
 * Each typed character is echoed as '*'.
 */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);

    let value = "";

    const stdin = process.stdin as NodeJS.ReadStream & {
      setRawMode?: (mode: boolean) => void;
    };

    if (stdin.isTTY) {
      stdin.setRawMode?.(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: Buffer | string) => {
      const c = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (c === "\r" || c === "\n") {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) {
          stdin.setRawMode?.(false);
        }
        process.stdout.write("\n");
        resolve(value);
      } else if (c === "\u0003") {
        // Ctrl+C
        process.exit(0);
      } else if (c === "\u007F" || c === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        value += c;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

/**
 * Present a numbered list and return the chosen value.
 * Repeats until a valid choice is made.
 */
export async function choose(question: string, choices: readonly string[]): Promise<string> {
  choices.forEach((c, i) => {
    console.log(`  [${i + 1}] ${c}`);
  });
  console.log();

  while (true) {
    const raw = await prompt(question);
    const idx = parseInt(raw, 10) - 1;
    if (idx >= 0 && idx < choices.length && choices[idx] !== undefined) {
      return choices[idx] as string;
    }
    console.log(`  Please enter a number between 1 and ${choices.length}.`);
  }
}
