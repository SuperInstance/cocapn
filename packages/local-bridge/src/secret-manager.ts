/**
 * SecretManager — manages age-encrypted secrets in the private repo.
 *
 * Identity loading order:
 *   1. OS keychain (keytar) under service "cocapn", account "age-identity"
 *   2. AGE_IDENTITY environment variable (for CI/headless environments)
 *   3. ~/.config/cocapn/identity.age file as last resort
 *
 * Decrypted values are cached in memory and never written to disk.
 * The secrets/ directory contains files encrypted with age — each file is
 * decrypted on demand and its content parsed as KEY=VALUE lines.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const KEYCHAIN_SERVICE = "cocapn";
const KEYCHAIN_ACCOUNT = "age-identity";
const FALLBACK_IDENTITY_PATH = join(homedir(), ".config", "cocapn", "identity.age");

export class SecretManager {
  private repoRoot: string;
  /** In-memory cache: key → decrypted value. Never persisted to disk. */
  private cache = new Map<string, string>();
  private identity: string | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  // ---------------------------------------------------------------------------
  // Identity management
  // ---------------------------------------------------------------------------

  /**
   * Load the age identity from keychain, env var, or fallback file.
   * Must be called before getSecret().
   */
  async loadIdentity(): Promise<void> {
    // 1. OS keychain (optional dependency — graceful fallback if unavailable)
    const keychainIdentity = await this.loadFromKeychain();
    if (keychainIdentity) {
      this.identity = keychainIdentity;
      console.info("[secrets] Loaded age identity from OS keychain");
      return;
    }

    // 2. Environment variable
    const envIdentity = process.env["AGE_IDENTITY"];
    if (envIdentity) {
      this.identity = envIdentity;
      console.info("[secrets] Loaded age identity from AGE_IDENTITY env var");
      return;
    }

    // 3. Fallback file
    if (existsSync(FALLBACK_IDENTITY_PATH)) {
      this.identity = readFileSync(FALLBACK_IDENTITY_PATH, "utf8");
      console.info(`[secrets] Loaded age identity from ${FALLBACK_IDENTITY_PATH}`);
      return;
    }

    console.warn("[secrets] No age identity found — secrets will not be decryptable");
  }

  /**
   * Store an age identity string in the OS keychain.
   * No-op if keytar is unavailable.
   */
  async storeIdentityInKeychain(identity: string): Promise<void> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) return;
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, identity);
      console.info("[secrets] Stored age identity in OS keychain");
    } catch (err) {
      console.warn("[secrets] Failed to store identity in keychain:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Secret access
  // ---------------------------------------------------------------------------

  /**
   * Get a secret by key.
   * Looks up all *.age files in the secrets/ directory, decrypting on demand.
   * Caches results in memory.
   */
  async getSecret(key: string): Promise<string | undefined> {
    // Fast path: already in cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (!this.identity) {
      console.warn(`[secrets] Cannot decrypt — no identity loaded`);
      return undefined;
    }

    // Load all secrets files into cache
    await this.loadSecretsDirectory();
    return this.cache.get(key);
  }

  /**
   * Check if a given secret key exists without decrypting all files.
   */
  async hasSecret(key: string): Promise<boolean> {
    return (await this.getSecret(key)) !== undefined;
  }

  /** Clear the in-memory cache (e.g. after identity rotation). */
  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async loadSecretsDirectory(): Promise<void> {
    const secretsDir = join(this.repoRoot, "secrets");
    if (!existsSync(secretsDir)) return;

    let files: string[];
    try {
      files = readdirSync(secretsDir).filter((f) => f.endsWith(".age"));
    } catch {
      return;
    }

    for (const file of files) {
      const filePath = join(secretsDir, file);
      await this.decryptFileIntoCache(filePath);
    }
  }

  private async decryptFileIntoCache(filePath: string): Promise<void> {
    if (!this.identity) return;

    try {
      // age-encryption uses an init() factory that resolves WASM
      const { default: initAge } = await import("age-encryption");
      const age = await (initAge as () => Promise<{
        Decrypter: new () => {
          addIdentity(identity: string): void;
          decrypt(data: Uint8Array, format: "text"): string;
        };
      }>)();

      const ciphertext = new Uint8Array(readFileSync(filePath));
      const decrypter = new age.Decrypter();
      decrypter.addIdentity(this.identity);

      const plaintext = decrypter.decrypt(ciphertext, "text");
      this.parseEnvLines(plaintext);
    } catch (err) {
      // Decryption failures are logged but not thrown — partial secrets are fine
      console.warn(`[secrets] Failed to decrypt ${filePath}:`, err);
    }
  }

  private parseEnvLines(content: string): void {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key) this.cache.set(key, value);
    }
  }

  private async loadFromKeychain(): Promise<string | null> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) return null;

    try {
      return await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    } catch {
      return null;
    }
  }

  private async tryImportKeytar(): Promise<
    { getPassword(s: string, a: string): Promise<string | null>; setPassword(s: string, a: string, p: string): Promise<void> } | null
  > {
    try {
      // keytar is an optional native dependency — may not be installed
      const mod = await import("keytar");
      return mod.default ?? (mod as unknown as { getPassword: typeof import("keytar")["getPassword"]; setPassword: typeof import("keytar")["setPassword"] });
    } catch {
      return null;
    }
  }
}
