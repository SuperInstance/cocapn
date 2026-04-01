# Gemini 3.1 Pro — Plugin Ecosystem Design

As a Platform Architect, I have designed the **Cocapn Plugin Ecosystem** around your core constraint: **Plugins are single, copy-pasteable TypeScript files. No `node_modules`, no build steps, no package.json.** 

This constraint is our superpower. It makes the ecosystem fast, viral, and infinitely hackable. Here is the comprehensive architectural blueprint.

---

### 1. PLUGIN DISCOVERY: The URL is the Package Manager

Since plugins are just files, we don't need a heavy registry like NPM. We use a decentralized, URL-based discovery system.

*   **The Hub:** A central GitHub repository (`cocapn/registry`) containing a single `registry.json`.
*   **Discovery via CLI:** Users type `cocapn plugin search <query>`. The CLI fetches the JSON and searches it.
*   **Previewing:** `cocapn plugin preview <username>/<plugin>`. The CLI fetches the raw `.ts` file, parses the exported `Plugin` interface via AST (without executing it), and prints the description, requested permissions, and hooks used.
*   **Installation:** `cocapn plugin add github:username/repo/plugin.ts` or `cocapn plugin add https://gist.github.com/...`

### 2. PLUGIN SAFETY: Declarative Sandboxing

Executing raw downloaded TS files is inherently dangerous. We use a **Permission Model** enforced by a wrapper around Node's `--experimental-permission` or a lightweight JS sandbox (like isolated-vm).

Plugins must declare their permissions in the interface. If a plugin tries to read a file without the `fs:read` permission, the Cocapn runtime throws a fatal error.

**What plugins can NEVER do:**
*   Access `process.env` directly (they must request specific keys via `config`).
*   Require arbitrary NPM packages (they can only use built-in Cocapn APIs passed via context).
*   Mutate the Cocapn core runtime objects (Context objects are frozen/proxied).

### 3. PLUGIN COMPATIBILITY: Flat Resolution

*   **Versioning:** Plugins declare a `version` (SemVer).
*   **Dependencies:** Plugins can declare dependencies via URLs. When Cocapn loads a plugin, it checks the `dependencies` array. If missing, it prompts the user to auto-download them.
*   **Conflicts:** Hook execution is sequential based on installation order. Commands are namespaced automatically: if two plugins register the `deploy` command, they become `pluginA:deploy` and `pluginB:deploy`.

### 4. PLUGIN MONETIZATION: Bring Your Own Key (BYOK)

Because the file is public/copy-pasteable, you cannot sell the *code*. You sell the *capability*.

*   **The Model:** The TS file is free. If the plugin requires a premium backend (e.g., an advanced proprietary AI model, a cloud database), the user buys a license key from the author's website.
*   **Integration:** The user runs `cocapn config set plugins.myplugin.apiKey "sk-..."`. The plugin reads this via its `init(config)` method.
*   **Marketplace:** The official Cocapn registry allows filtering by "Free", "Requires API Key", and "Open Source".

---

### 5. API DESIGN: The Core Architecture

Here is the complete TypeScript contract. Notice how dependencies (like `fetch` or `fs` access) are injected via the `Context` to maintain the sandbox.

```typescript
// --- TYPES ---

export type Permission = 
  | 'fs:read' | 'fs:write' | 'net:fetch' | 'sys:command' 
  | 'agent:read' | 'agent:write' | 'memory:read' | 'memory:write';

export interface CocapnContext {
  // Sandboxed APIs injected by the runtime
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
  };
  net: {
    fetch(url: string, options?: any): Promise<Response>;
  };
  sys: {
    exec(cmd: string): Promise<{ stdout: string; stderr: string }>;
  };
  memory: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
  };
  agent: {
    send(message: string): Promise<string>;
    getHistory(): Promise<Message[]>;
  };
  log: (msg: string) => void;
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  execute: (ctx: CocapnContext, args: string[]) => Promise<void>;
}

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  handler: (req: any, res: any, ctx: CocapnContext) => void;
}

// --- THE PLUGIN INTERFACE ---

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: Permission[];
  dependencies?: string[]; // URLs to other plugin .ts files
  
  // Lifecycle
  init?(config: Record<string, any>, ctx: CocapnContext): Promise<void>;
  onShutdown?(ctx: CocapnContext): Promise<void>;

  // Extensions
  commands?: Command[];
  api?: Route[];

  // Hooks (Middleware style)
  hooks?: {
    // Agent
    onBeforeAgentMessage?: (msg: string, ctx: CocapnContext) => Promise<string | false>;
    onAfterAgentMessage?: (response: string, ctx: CocapnContext) => Promise<void>;
    
    // Memory
    onMemorySave?: (key: string, value: any, ctx: CocapnContext) => Promise<any>;
    
    // File System (Fires when the agent modifies files)
    onFileModify?: (path: string, content: string, ctx: CocapnContext) => Promise<void>;
  };
}
```

---

### 6. BUILT-IN PLUGINS (The Essential 10)

These ship with Cocapn as standard `.ts` files in the `~/.cocapn/plugins/core/` directory.

1.  **`vision.ts`**: Hooks into `onBeforeAgentMessage`. If the user attaches an image path, it converts it to base64, calls an LLM vision API, and appends the description to the prompt.
2.  **`research.ts`**: Adds a `research` command. Uses `net:fetch` to scrape DuckDuckGo/Wikipedia, summarizes findings, and saves them to `memory`.
3.  **`analytics.ts`**: Hooks into all agent events. Aggregates token usage and response times. Exposes an API route `/api/stats` for a local dashboard.
4.  **`channels.ts`**: Exposes webhook API routes. Translates incoming Discord/Telegram JSON into `agent.send()` calls, and routes the output back to the chat APIs.
5.  **`a2a.ts`**: (Agent-to-Agent). Registers a command allowing the current agent to spawn a sub-Cocapn process, delegating tasks and waiting for the sub-agent's response.
6.  **`git.ts`**: Hooks into `onFileModify`. Automatically stages and generates a commit message via the agent after a batch of files are changed.
7.  **`testing.ts`**: Adds a `test` command. Reads the current project structure, asks the agent to write Jest/Vitest tests, and uses `sys:exec` to run them, feeding errors back to the agent.
8.  **`docs.ts`**: Scans the codebase. Uses the agent to generate a `README.md` or JSDoc comments, utilizing `fs:write`.
9.  **`deploy.ts`**: Adds a `deploy` command. Zips the directory, uses `net:fetch` to push to Vercel or an AWS webhook based on user config.
10. **`backup.ts`**: Hooks `onShutdown`. Zips the agent's memory and history, saving it to a designated local folder or AWS S3.

---

### 7. VIRAL GROWTH: How it Spreads

1.  **The `share` Command:** A user writes a cool plugin locally. They type `cocapn share ./my-plugin.ts`. Cocapn creates a public GitHub Gist and copies the `cocapn plugin add https://gist...` command to their clipboard. They drop this in Discord.
2.  **Plugin Packs:** A "pack" is just a plugin that does nothing but declare `dependencies`. E.g., `data-science-pack.ts` depends on `jupyter.ts`, `pandas-helper.ts`, and `plot.ts`.
3.  **Prompt Injection:** Because plugins are text, an agent can *write its own plugins*. You can tell Cocapn: "Write a plugin that reminds me to drink water every hour." Cocapn writes the `.ts` file and hot-reloads it.

---

### 8. EXAMPLE PLUGINS (5 Killer Apps)

Here are 5 complete, copy-pasteable plugins that demonstrate the power of this architecture.

#### 1. The "Auto-Fixer" (Developers will love this)
Watches for terminal errors. If a command fails, it intercepts the error, asks the agent to fix it, and suggests the correct command.

```typescript
// autofix.ts
import type { Plugin, CocapnContext } from '@cocapn/types';

export default {
  name: 'autofix',
  version: '1.0.0',
  description: 'Automatically suggests fixes for failed terminal commands.',
  author: 'cocapn-core',
  permissions: ['sys:command', 'agent:read'],
  
  commands: [{
    name: 'run',
    description: 'Run a command and auto-fix if it fails',
    usage: 'run <command>',
    execute: async (ctx: CocapnContext, args: string[]) => {
      const cmd = args.join(' ');
      try {
        const { stdout } = await ctx.sys.exec(cmd);
        ctx.log(stdout);
      } catch (error: any) {
        ctx.log(`❌ Command failed. Asking agent for fix...`);
        const prompt = `The command "${cmd}" failed with error:\n${error.stderr || error.message}\nProvide ONLY the corrected terminal command to fix this.`;
        const fix = await ctx.agent.send(prompt);
        ctx.log(`💡 Suggested fix: ${fix}`);
      }
    }
  }]
} satisfies Plugin;
```

#### 2. The "Mind Reader" (Local Knowledge Graph)
Extracts facts from every conversation and builds a persistent memory graph.

```typescript
// mindreader.ts
import type { Plugin, CocapnContext } from '@cocapn/types';

export default {
  name: 'mindreader',
  version: '1.1.0',
  description: 'Extracts entities and facts into persistent memory.',
  author: 'data-nerd',
  permissions: ['memory:read', 'memory:write', 'agent:read'],
  
  hooks: {
    onAfterAgentMessage: async (response: string, ctx: CocapnContext) => {
      // Ask agent to extract facts in the background
      const extractionPrompt = `Extract key facts from this text as JSON array of strings: "${response}"`;
      const factsJson = await ctx.agent.send(extractionPrompt);
      
      try {
        const newFacts = JSON.parse(factsJson);
        const existingFacts = await ctx.memory.get('user_facts') || [];
        await ctx.memory.set('user_facts', [...existingFacts, ...newFacts]);
        ctx.log(`🧠 Learned ${newFacts.length} new facts.`);
      } catch (e) {
        // Silent fail on parse error
      }
    }
  }
} satisfies Plugin;
```

#### 3. The "Slack Mirror" (Enterprise ready)
Mirrors your terminal agent directly to a Slack channel.

```typescript
// slack-mirror.ts
import type { Plugin, CocapnContext } from '@cocapn/types';

let slackWebhookUrl = '';

export default {
  name: 'slack-mirror',
  version: '2.0.0',
  description: 'Mirrors agent responses to a Slack channel.',
  author: 'enterprise-bob',
  permissions: ['net:fetch'],
  
  init: async (config: Record<string, any>) => {
    slackWebhookUrl = config.slackWebhookUrl;
    if (!slackWebhookUrl) throw new Error("Missing slackWebhookUrl in config");
  },

  hooks: {
    onAfterAgentMessage: async (response: string, ctx: CocapnContext) => {
      await ctx.net.fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🤖 *Cocapn:*\n${response}` })
      });
    }
  }
} satisfies Plugin;
```

#### 4. The "File Guardian" (Safety/Security)
Prevents the agent from accidentally deleting or modifying sensitive files.

```typescript
// guardian.ts
import type { Plugin, CocapnContext } from '@cocapn/types';

const PROTECTED_FILES = ['.env', 'package.json', 'cocapn.config.ts'];

export default {
  name: 'guardian',
  version: '1.0.0',
  description: 'Prevents agent from modifying critical files.',
  author: 'sec-ops',
  permissions: [], // Only needs hook access
  
  hooks: {
    onFileModify: async (path: string, content: string, ctx: CocapnContext) => {
      const fileName = path.split('/').pop() || '';
      if (PROTECTED_FILES.includes(fileName)) {
        ctx.log(`🛡️ Guardian blocked modification of ${fileName}`);
        throw new Error(`Permission denied: Cannot modify protected file ${fileName}`);
      }
    }
  }
} satisfies Plugin;
```

#### 5. The "Pomodoro Agent" (Productivity)
Combines scheduling (via API route/timers) with agent interactions to keep you on track.

```typescript
// pomodoro.ts
import type { Plugin, CocapnContext } from '@cocapn/types';

let timer: any;

export default {
  name: 'pomodoro',
  version: '1.0.0',
  description: 'Agent-driven pomodoro timer.',
  author: 'focus-guru',
  permissions: ['agent:write'],
  
  commands: [{
    name: 'focus',
    description: 'Start a 25 minute focus session',
    usage: 'focus',
    execute: async (ctx: CocapnContext) => {
      ctx.log('🍅 Focus session started! See you in 25 mins.');
      if (timer) clearTimeout(timer);
      
      timer = setTimeout(async () => {
        const msg = await ctx.agent.send("The user just finished a 25 minute focus session. Give them a short, aggressive motivational congratulation and tell them to take a 5 min break.");
        ctx.log(`\n⏰ ${msg}`);
      }, 25 * 60 * 1000);
    }
  }]
} satisfies Plugin;
```