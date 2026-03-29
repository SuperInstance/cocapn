/**
 * Profile — generate and export user profiles for fleet discovery.
 *
 * A profile aggregates:
 *   - facts.json: display-name, current-project, website
 *   - soul.md: bio (first paragraph)
 *   - config: discovery flag, fleet domains
 *
 * The exported cocapn/profile.json in the public repo includes:
 *   - profile data
 *   - fleet key signature (JWT signed with fleet-key)
 *   - timestamp
 *
 * This enables discovery registry verification and cross-domain messaging.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";
import type { BridgeConfig } from "../config/types.js";
import type { GitSync } from "../git/sync.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  /** Display name from facts.json */
  displayName?: string;
  /** Current project from facts.json */
  currentProject?: string;
  /** Website URL from facts.json */
  website?: string;
  /** Bio from soul.md (first paragraph, truncated) */
  bio?: string;
  /** Discovery flag from config */
  discovery: boolean;
  /** Fleet domains from config */
  domains: string[];
  /** ISO timestamp of generation */
  generatedAt: string;
}

export interface SignedProfile {
  /** The profile data */
  profile: Profile;
  /** JWT signature using fleet key */
  signature: string;
  /** ISO timestamp of export */
  exportedAt: string;
}

export interface ProfileManagerOptions {
  /** Root of the private encrypted repo */
  privateRepoRoot: string;
  /** Root of the public repo where profile.json is written */
  publicRepoRoot: string;
  /** Discovery flag — if false, profile is generated but not exported */
  discovery?: boolean;
  /** Optional fleet domains for multi-domain deployments */
  domains?: string[];
}

// ─── ProfileManager ───────────────────────────────────────────────────────────

export class ProfileManager {
  private privateRepoRoot: string;
  private publicRepoRoot: string;
  private brain: Brain;
  private config: BridgeConfig;
  private sync: GitSync;

  constructor(
    options: ProfileManagerOptions,
    brain: Brain,
    config: BridgeConfig,
    sync: GitSync
  ) {
    this.privateRepoRoot = options.privateRepoRoot;
    this.publicRepoRoot = options.publicRepoRoot;
    this.brain = brain;
    this.config = config;
    this.sync = sync;
  }

  /**
   * Generate a profile from the private repo.
   *
   * Reads from:
   *   - facts.json: display-name, current-project, website
   *   - soul.md: bio (first paragraph, max 500 chars)
   *   - constructor options: discovery flag, domains
   *
   * Returns a Profile object with generatedAt timestamp.
   */
  generateProfile(): Profile {
    const displayName = this.brain.getFact("display-name");
    const currentProject = this.brain.getFact("current-project");
    const website = this.brain.getFact("website");

    const soul = this.brain.getSoul();
    const bio = this.extractBio(soul);

    return {
      displayName,
      currentProject,
      website,
      bio,
      discovery: true, // Default to discoverable
      domains: [],     // No domains in private config
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Export a signed profile to the public repo.
   *
   * Writes cocapn/profile.json with:
   *   - profile data
   *   - fleet key signature (if available)
   *   - exportedAt timestamp
   *
   * Commits with message: "👤 Update profile - <display-name>"
   *
   * If fleet key is not available, exports without signature.
   */
  async exportProfile(signFn?: (payload: string) => Promise<string>): Promise<void> {
    const profile = this.generateProfile();

    // Build the signed profile structure
    const signature = signFn
      ? await signFn(JSON.stringify(profile))
      : "";

    const signedProfile: SignedProfile = {
      profile,
      signature,
      exportedAt: new Date().toISOString(),
    };

    // Ensure cocapn directory exists in public repo
    const cocapnDir = join(this.publicRepoRoot, "cocapn");
    if (!existsSync(cocapnDir)) {
      mkdirSync(cocapnDir, { recursive: true });
    }

    // Write profile.json
    const profilePath = join(cocapnDir, "profile.json");
    writeFileSync(profilePath, JSON.stringify(signedProfile, null, 2) + "\n", "utf8");

    // Commit to public repo
    const displayName = profile.displayName || "user";
    const commitMsg = `👤 Update profile - ${displayName}`;

    try {
      const git = simpleGit(this.publicRepoRoot);
      await git.add("cocapn/profile.json");
      await git.commit(commitMsg);
    } catch {
      // Non-fatal: file is written; commit may fail if nothing changed
    }
  }

  /**
   * Load a profile from the public repo.
   *
   * Returns undefined if profile.json doesn't exist.
   */
  loadPublicProfile(): SignedProfile | undefined {
    const profilePath = join(this.publicRepoRoot, "cocapn", "profile.json");
    if (!existsSync(profilePath)) return undefined;

    try {
      const raw = readFileSync(profilePath, "utf8");
      return JSON.parse(raw) as SignedProfile;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the bio from soul.md.
   *
   * Returns the first non-empty paragraph that is not just a header, truncated to 500 chars.
   * Strips inline markdown formatting (# headers, etc.)
   */
  private extractBio(soul: string): string | undefined {
    if (!soul) return undefined;

    // Split into paragraphs, skip empty lines
    const paragraphs = soul
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.length === 0) return undefined;

    // Find first paragraph that is not just a header
    // A header-only paragraph is one that starts with # followed by optional text
    let bio: string | undefined = undefined;
    for (const para of paragraphs) {
      // Skip if the paragraph is just a header line
      if (/^#\s+\S/.test(para) && !para.includes("\n")) {
        continue;
      }
      bio = para;
      break;
    }

    if (!bio) return undefined;

    // Strip any leading # headers from multi-line content
    bio = bio.replace(/^#+\s+.*$/m, "").trim();

    // Truncate to 500 chars
    if (bio.length > 500) {
      bio = bio.slice(0, 497) + "...";
    }

    return bio;
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Create a ProfileManager from minimal dependencies.
 *
 * Convenience factory for CLI and testing.
 */
export function createProfileManager(
  privateRepoRoot: string,
  publicRepoRoot: string,
  brain: Brain,
  config: BridgeConfig,
  sync: GitSync
): ProfileManager {
  return new ProfileManager(
    { privateRepoRoot, publicRepoRoot },
    brain,
    config,
    sync
  );
}
