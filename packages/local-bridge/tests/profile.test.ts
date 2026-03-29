/**
 * Profile generation and export tests.
 *
 * Tests:
 *   1. generateProfile returns profile with defaults
 *   2. generateProfile reads display-name from facts
 *   3. generateProfile reads current-project from facts
 *   4. generateProfile reads website from facts
 *   5. generateProfile extracts bio from soul.md
 *   6. generateProfile truncates long bio to 500 chars
 *   7. exportProfile writes signed profile to public repo
 *   8. loadPublicProfile reads existing profile
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ProfileManager,
  type SignedProfile,
  createProfileManager,
} from "../src/publishing/profile.js";
import { Brain } from "../src/brain/index.js";
import { GitSync } from "../src/git/sync.js";
import type { BridgeConfig } from "../src/config/types.js";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Test fixtures
const TEST_DIR = "/tmp/cocapn-test-profile";
const PRIVATE_DIR = join(TEST_DIR, "private");
const PUBLIC_DIR = join(TEST_DIR, "public");

function setupTestDirs(): void {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
  mkdirSync(PRIVATE_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Create minimal cocapn structure
  mkdirSync(join(PRIVATE_DIR, "cocapn"), { recursive: true });
  mkdirSync(join(PRIVATE_DIR, "cocapn", "memory"), { recursive: true });

  // Create minimal soul.md
  const soulPath = join(PRIVATE_DIR, "soul.md");
  writeFileSync(soulPath, "# My Soul\n\nI am a helpful assistant focused on productivity and creativity.\n\n## Values\n- Honesty\n- Excellence", "utf8");

  // Create minimal facts.json
  const factsPath = join(PRIVATE_DIR, "cocapn", "memory", "facts.json");
  writeFileSync(factsPath, JSON.stringify({
    "display-name": "Test User",
    "current-project": "Building cocapn",
    "website": "https://example.com",
  }, null, 2), "utf8");

  // Create minimal cocapn.yml for config
  const configPath = join(PRIVATE_DIR, "cocapn.yml");
  writeFileSync(configPath, `
soul: soul.md
memory:
  facts: cocapn/memory/facts.json
  procedures: cocapn/memory/procedures
  relationships: cocapn/memory/relationships.json
encryption:
  publicKey: test-age-public-key
  recipients: []
  encryptedPaths: []
sync:
  interval: 300
  memoryInterval: 60
  autoCommit: true
  autoPush: false
`, "utf8");
}

function cleanupTestDirs(): void {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("ProfileManager", () => {
  let brain: Brain;
  let config: BridgeConfig;
  let sync: GitSync;
  let manager: ProfileManager;

  beforeEach(() => {
    setupTestDirs();

    // Create minimal config
    config = {
      soul: "soul.md",
      config: {
        mode: "local",
        port: 8787,
        tunnel: undefined,
      },
      memory: {
        facts: "cocapn/memory/facts.json",
        procedures: "cocapn/memory/procedures",
        relationships: "cocapn/memory/relationships.json",
      },
      encryption: {
        publicKey: "test-age-public-key",
        recipients: [],
        encryptedPaths: [],
      },
      sync: {
        interval: 300,
        memoryInterval: 60,
        autoCommit: true,
        autoPush: false,
      },
    };

    // Create sync (mock Git operations)
    sync = new GitSync(PRIVATE_DIR, config);

    // Create brain
    brain = new Brain(PRIVATE_DIR, config, sync);

    // Create profile manager
    manager = createProfileManager(PRIVATE_DIR, PUBLIC_DIR, brain, config, sync);
  });

  afterEach(() => {
    // Cleanup after each test
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("test 1: generateProfile returns profile with defaults", () => {
    const profile = manager.generateProfile();

    expect(profile).toBeDefined();
    expect(profile.discovery).toBe(true);
    expect(profile.domains).toEqual([]);
    expect(profile.generatedAt).toBeDefined();
    expect(typeof profile.generatedAt).toBe("string");
  });

  it("test 2: generateProfile reads display-name from facts", () => {
    const profile = manager.generateProfile();

    expect(profile.displayName).toBe("Test User");
  });

  it("test 3: generateProfile reads current-project from facts", () => {
    const profile = manager.generateProfile();

    expect(profile.currentProject).toBe("Building cocapn");
  });

  it("test 4: generateProfile reads website from facts", () => {
    const profile = manager.generateProfile();

    expect(profile.website).toBe("https://example.com");
  });

  it("test 5: generateProfile extracts bio from soul.md", () => {
    const profile = manager.generateProfile();

    expect(profile.bio).toBeDefined();
    expect(profile.bio).toContain("helpful assistant");
    // Bio should not contain the markdown header
    expect(profile.bio).not.toContain("#");
  });

  it("test 6: generateProfile truncates long bio to 500 chars", () => {
    // Update soul.md with a very long bio
    const soulPath = join(PRIVATE_DIR, "soul.md");
    const longBio = "A".repeat(1000);
    writeFileSync(soulPath, `# My Soul\n\n${longBio}`, "utf8");

    // Recreate brain to pick up new soul.md
    brain = new Brain(PRIVATE_DIR, config, sync);
    manager = createProfileManager(PRIVATE_DIR, PUBLIC_DIR, brain, config, sync);

    const profile = manager.generateProfile();

    expect(profile.bio).toBeDefined();
    expect(profile.bio!.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(profile.bio).toMatch(/\.\.\.$/);
  });

  it("test 7: exportProfile writes signed profile to public repo", async () => {
    const signFn = vi.fn().mockResolvedValue("test-signature");

    await manager.exportProfile(signFn);

    const profilePath = join(PUBLIC_DIR, "cocapn", "profile.json");
    expect(existsSync(profilePath)).toBe(true);

    const content = readFileSync(profilePath, "utf8");
    const signedProfile = JSON.parse(content) as SignedProfile;

    expect(signedProfile.signature).toBe("test-signature");
    expect(signedProfile.exportedAt).toBeDefined();
    expect(signedProfile.profile.displayName).toBe("Test User");
    expect(signFn).toHaveBeenCalledWith(
      expect.stringContaining("Test User")
    );
  });

  it("test 8: loadPublicProfile reads existing profile", async () => {
    // First export a profile
    await manager.exportProfile();

    // Load it back
    const loaded = manager.loadPublicProfile();

    expect(loaded).toBeDefined();
    expect(loaded!.profile.displayName).toBe("Test User");
    expect(loaded!.exportedAt).toBeDefined();
  });
});

describe("ProfileManager edge cases", () => {
  afterEach(() => {
    cleanupTestDirs();
  });

  it("handles missing facts gracefully", () => {
    setupTestDirs();

    // Set facts.json to empty object
    const factsPath = join(PRIVATE_DIR, "cocapn", "memory", "facts.json");
    writeFileSync(factsPath, "{}", "utf8");

    const config: BridgeConfig = {
      soul: "soul.md",
      config: { mode: "local", port: 8787, tunnel: undefined },
      memory: {
        facts: "cocapn/memory/facts.json",
        procedures: "cocapn/memory/procedures",
        relationships: "cocapn/memory/relationships.json",
      },
      encryption: {
        publicKey: "test-age-public-key",
        recipients: [],
        encryptedPaths: [],
      },
      sync: {
        interval: 300,
        memoryInterval: 60,
        autoCommit: true,
        autoPush: false,
      },
    };

    const sync = new GitSync(PRIVATE_DIR, config);
    const brain = new Brain(PRIVATE_DIR, config, sync);
    const manager = createProfileManager(PRIVATE_DIR, PUBLIC_DIR, brain, config, sync);

    const profile = manager.generateProfile();

    expect(profile.displayName).toBeUndefined();
    expect(profile.currentProject).toBeUndefined();
    expect(profile.website).toBeUndefined();
  });

  it("handles missing soul.md gracefully", () => {
    setupTestDirs();

    // Remove soul.md
    const soulPath = join(PRIVATE_DIR, "soul.md");
    try {
      rmSync(soulPath);
    } catch {
      // ignore
    }

    const config: BridgeConfig = {
      soul: "soul.md",
      config: { mode: "local", port: 8787, tunnel: undefined },
      memory: {
        facts: "cocapn/memory/facts.json",
        procedures: "cocapn/memory/procedures",
        relationships: "cocapn/memory/relationships.json",
      },
      encryption: {
        publicKey: "test-age-public-key",
        recipients: [],
        encryptedPaths: [],
      },
      sync: {
        interval: 300,
        memoryInterval: 60,
        autoCommit: true,
        autoPush: false,
      },
    };

    const sync = new GitSync(PRIVATE_DIR, config);
    const brain = new Brain(PRIVATE_DIR, config, sync);
    const manager = createProfileManager(PRIVATE_DIR, PUBLIC_DIR, brain, config, sync);

    const profile = manager.generateProfile();

    expect(profile.bio).toBeUndefined();
  });

  it("handles missing public profile gracefully", () => {
    setupTestDirs();

    const config: BridgeConfig = {
      soul: "soul.md",
      config: { mode: "local", port: 8787, tunnel: undefined },
      memory: {
        facts: "cocapn/memory/facts.json",
        procedures: "cocapn/memory/procedures",
        relationships: "cocapn/memory/relationships.json",
      },
      encryption: {
        publicKey: "test-age-public-key",
        recipients: [],
        encryptedPaths: [],
      },
      sync: {
        interval: 300,
        memoryInterval: 60,
        autoCommit: true,
        autoPush: false,
      },
    };

    const sync = new GitSync(PRIVATE_DIR, config);
    const brain = new Brain(PRIVATE_DIR, config, sync);
    const manager = createProfileManager(PRIVATE_DIR, PUBLIC_DIR, brain, config, sync);

    const loaded = manager.loadPublicProfile();

    expect(loaded).toBeUndefined();
  });
});
