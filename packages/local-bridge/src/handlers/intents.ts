/**
 * Intent parsers — pure functions for detecting special commands in chat messages.
 *
 * These parsers extract structured intent from natural language input:
 * - Module installation: "install habit-tracker"
 * - Peer queries: "ask makerlog for my project count"
 * - Skin changes: "change skin to dark"
 *
 * All functions are pure (no side effects) and fully testable.
 */

// ─── Intent types ─────────────────────────────────────────────────────────────

/**
 * Intent to install a module from a git repository.
 */
export interface ModuleInstallIntent {
  gitUrl: string;
  moduleName: string;
}

/**
 * Intent to query a fact from a remote peer/domain.
 */
export interface PeerQueryIntent {
  domain: string;
  factKey: string;
  /** Full original message — used for context in the response */
  originalContent: string;
}

/**
 * Intent to change the UI theme/skin.
 */
export interface SkinIntent {
  skin: string;
  preview: boolean;
}

// ─── Intent parsers ───────────────────────────────────────────────────────────

/**
 * Detect module installation phrases:
 *   "install habit tracker"
 *   "add the perplexity-search module"
 *   "install module from github.com/cocapn/habit-tracker"
 *
 * @param content  The chat message content
 * @returns ModuleInstallIntent if a match is found, undefined otherwise
 */
export function parseModuleInstallIntent(content: string): ModuleInstallIntent | undefined {
  const lower = content.toLowerCase().trim();

  // Explicit git URL
  const urlMatch = lower.match(
    /(?:install|add)\s+(?:module\s+)?(?:from\s+)?((https?:\/\/|git@)[^\s]+)/
  );
  if (urlMatch?.[1]) {
    const gitUrl = urlMatch[1].trim();
    const name   = gitUrl.replace(/\.git$/, "").split("/").pop() ?? "module";
    return { gitUrl, moduleName: name };
  }

  // Registry shorthand: "install habit-tracker"
  const knownMatch = lower.match(
    /^(?:install|add)\s+(?:the\s+)?(?:module\s+)?([a-z][a-z0-9-]+)(?:\s+module)?$/
  );
  if (knownMatch?.[1]) {
    const slug   = knownMatch[1].trim().replace(/\s+/g, "-");
    const gitUrl = `https://github.com/cocapn/${slug}`;
    return { gitUrl, moduleName: slug };
  }

  return undefined;
}

/**
 * Detect cross-domain peer fact lookup:
 *   "Am I too tired to solder? ask activelog"
 *   "from studylog: what's my reading streak?"
 *   "ask makerlog for my project count"
 *
 * @param content  The chat message content
 * @returns PeerQueryIntent if a match is found, undefined otherwise
 */
export function parsePeerQueryIntent(content: string): PeerQueryIntent | undefined {
  const lower = content.toLowerCase().trim();

  // "ask <domain> [for] <fact-key>"
  const askMatch = lower.match(
    /ask\s+([a-z][a-z0-9.-]+(?:log|bridge)?(?:\.ai|\.io|:\d+)?)\s+(?:for\s+)?(.+)/
  );
  if (askMatch?.[1] && askMatch?.[2]) {
    return {
      domain:          askMatch[1].trim(),
      factKey:         askMatch[2].trim().replace(/[?"!.]+$/, ""),
      originalContent: content,
    };
  }

  // "<question>? ask <domain>"
  const trailMatch = lower.match(
    /^(.+?)\??\s+ask\s+([a-z][a-z0-9.-]+(?:log|bridge)?)(?:\s|$)/
  );
  if (trailMatch?.[1] && trailMatch?.[2]) {
    return {
      domain:          trailMatch[2].trim(),
      factKey:         trailMatch[1].trim(),
      originalContent: content,
    };
  }

  // "from <domain>: <question>"
  const fromMatch = lower.match(/^from\s+([a-z][a-z0-9.-]+(?:log|bridge)?):\s*(.+)/);
  if (fromMatch?.[1] && fromMatch?.[2]) {
    return {
      domain:          fromMatch[1].trim(),
      factKey:         fromMatch[2].trim().replace(/[?"!.]+$/, ""),
      originalContent: content,
    };
  }

  return undefined;
}

/**
 * Detect theme/skin change requests:
 *   "change skin to dark"
 *   "use theme cyberpunk"
 *   "switch to the dark theme"
 *   "preview the light skin"
 *
 * @param content  The chat message content
 * @returns SkinIntent if a match is found, undefined otherwise
 */
export function parseSkinIntent(content: string): SkinIntent | undefined {
  const lower   = content.toLowerCase().trim();
  const preview = lower.includes("preview");

  const patterns = [
    /(?:change|switch|use|apply|set)\s+(?:the\s+)?(?:skin|theme)\s+(?:to\s+)?([a-z][a-z0-9-]+)/,
    /(?:use|apply)\s+(?:the\s+)?([a-z][a-z0-9-]+)\s+(?:skin|theme)/,
    /preview\s+(?:the\s+)?([a-z][a-z0-9-]+)\s+(?:skin|theme)/,
    /(?:make\s+it|go)\s+([a-z][a-z0-9-]+)(?:\s+theme)?$/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return { skin: match[1].trim(), preview };
    }
  }

  return undefined;
}
