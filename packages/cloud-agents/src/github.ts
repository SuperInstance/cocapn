/**
 * GitHub API client for Cloudflare Workers.
 *
 * Cloud agents read soul.md and memory from the private repo for context,
 * and write results back as commits so Git remains the source of truth.
 *
 * Token precedence:
 *   1. Authorization header forwarded from the local bridge session
 *   2. GITHUB_PAT secret bound to the Worker
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubClientOptions {
  token: string;
  privateRepo: string;   // "owner/repo"
  publicRepo?: string;
}

export class GitHubClient {
  private token:       string;
  private privateRepo: string;
  private publicRepo:  string | undefined;

  constructor(options: GitHubClientOptions) {
    this.token       = options.token;
    this.privateRepo = options.privateRepo;
    this.publicRepo  = options.publicRepo;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** Fetch a file's decoded text content from the private repo. */
  async readFile(path: string, ref = "HEAD"): Promise<string | null> {
    const url = `${GITHUB_API}/repos/${this.privateRepo}/contents/${path}?ref=${ref}`;
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status}`);

    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    return atob(data.content.replace(/\n/g, ""));
  }

  /** Fetch soul.md — the agent's personality context. */
  async readSoul(): Promise<string> {
    return (await this.readFile("cocapn/soul.md")) ?? "";
  }

  /** Fetch memory facts as a parsed JSON array. */
  async readFacts(): Promise<unknown[]> {
    const raw = await this.readFile("cocapn/memory/facts.json");
    if (!raw) return [];
    try { return JSON.parse(raw) as unknown[]; }
    catch { return []; }
  }

  /** Fetch wiki README for broader context. */
  async readWiki(): Promise<string> {
    return (await this.readFile("cocapn/wiki/README.md")) ?? "";
  }

  // ── Write (commit) ────────────────────────────────────────────────────────

  /**
   * Write a file to the private repo as a new commit.
   * Uses the GitHub Contents API (PUT) which creates or updates a file.
   */
  async writeFile(
    path: string,
    content: string,
    message: string
  ): Promise<void> {
    // Get current SHA so we can update an existing file
    const sha = await this.getFileSha(path);

    const url  = `${GITHUB_API}/repos/${this.privateRepo}/contents/${path}`;
    const body: Record<string, unknown> = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
    };
    if (sha) body["sha"] = sha;

    const res = await fetch(url, {
      method:  "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub write ${path}: ${res.status} — ${err}`);
    }
  }

  /**
   * Append a line to a NDJSON log file (e.g., coordination.jsonl).
   * Reads existing content, appends, then writes back.
   */
  async appendNdjson(path: string, record: unknown, commitMessage: string): Promise<void> {
    const existing = (await this.readFile(path)) ?? "";
    const newContent = existing.trimEnd() + "\n" + JSON.stringify(record) + "\n";
    await this.writeFile(path, newContent, commitMessage);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      Authorization:          `Bearer ${this.token}`,
      Accept:                  "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async getFileSha(path: string): Promise<string | null> {
    const url = `${GITHUB_API}/repos/${this.privateRepo}/contents/${path}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json() as { sha?: string };
    return data.sha ?? null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a GitHubClient from Worker env and an optional per-request token.
 * The per-request token (forwarded by the local bridge) takes precedence.
 */
export function makeGitHubClient(
  env: { GITHUB_PAT: string; PRIVATE_REPO: string; PUBLIC_REPO?: string },
  requestToken?: string
): GitHubClient {
  return new GitHubClient({
    token:       requestToken ?? env.GITHUB_PAT,
    privateRepo: env.PRIVATE_REPO,
    publicRepo:  env.PUBLIC_REPO,
  });
}
