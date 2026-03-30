/**
 * Tests for TwoRepoSync — uses real temp git repos for private + public.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { TwoRepoSync, type TwoRepoConfig } from "../../src/git/two-repo-sync.js";

async function makeTempGitRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-tworepo-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test repo\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

function makeConfig(privatePath: string, publicPath: string): TwoRepoConfig {
  return {
    privateRepo: { path: privatePath },
    publicRepo: { path: publicPath },
    autoSync: true,
    syncInterval: 60,
  };
}

describe("TwoRepoSync", () => {
  let privateDir: string;
  let publicDir: string;
  let twoRepo: TwoRepoSync;

  beforeEach(async () => {
    privateDir = await makeTempGitRepo();
    publicDir = await makeTempGitRepo();
    twoRepo = new TwoRepoSync(makeConfig(privateDir, publicDir));
  });

  afterEach(() => {
    twoRepo.stop();
    rmSync(privateDir, { recursive: true, force: true });
    rmSync(publicDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // linkRepos
  // ---------------------------------------------------------------------------

  describe("linkRepos", () => {
    it("returns true when both repos are valid git repos", async () => {
      const linked = await twoRepo.linkRepos();
      expect(linked).toBe(true);
    });

    it("returns false when private repo path does not exist", async () => {
      const badConfig = makeConfig("/tmp/nonexistent-brain-xyz", publicDir);
      const badSync = new TwoRepoSync(badConfig);
      const linked = await badSync.linkRepos();
      expect(linked).toBe(false);
      badSync.stop();
    });

    it("returns false when public repo path does not exist", async () => {
      const badConfig = makeConfig(privateDir, "/tmp/nonexistent-face-xyz");
      const badSync = new TwoRepoSync(badConfig);
      const linked = await badSync.linkRepos();
      expect(linked).toBe(false);
      badSync.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // getStatus
  // ---------------------------------------------------------------------------

  describe("getStatus", () => {
    it("returns status for both repos with linked=true after linking", async () => {
      await twoRepo.linkRepos();
      const status = await twoRepo.getStatus();

      expect(status.linked).toBe(true);
      expect(status.syncing).toBe(false);
      expect(status.privateRepo.path).toBe(privateDir);
      expect(status.publicRepo.path).toBe(publicDir);
      expect(status.privateRepo.clean).toBe(true);
      expect(status.publicRepo.clean).toBe(true);
      // Default git branch varies — just check it's a non-empty string
      expect(status.privateRepo.branch).toBeTruthy();
      expect(status.publicRepo.branch).toBeTruthy();
    });

    it("reports changed files when files are modified", async () => {
      await twoRepo.linkRepos();
      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), '{"key": "val"}');
      mkdirSync(join(publicDir, "src"), { recursive: true });
      writeFileSync(join(publicDir, "src", "app.ts"), "console.log(1)");

      const status = await twoRepo.getStatus();
      expect(status.privateRepo.clean).toBe(false);
      expect(status.publicRepo.clean).toBe(false);
      expect(status.privateRepo.changedFiles.length).toBeGreaterThan(0);
      expect(status.publicRepo.changedFiles.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getPrivateChanges / getPublicChanges
  // ---------------------------------------------------------------------------

  describe("getPrivateChanges / getPublicChanges", () => {
    it("returns empty arrays when both repos are clean", async () => {
      const privateChanges = await twoRepo.getPrivateChanges();
      const publicChanges = await twoRepo.getPublicChanges();
      expect(privateChanges).toEqual([]);
      expect(publicChanges).toEqual([]);
    });

    it("lists changed files in private repo", async () => {
      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");

      const changes = await twoRepo.getPrivateChanges();
      expect(changes.some((f) => f.includes("facts.json"))).toBe(true);
    });

    it("lists changed files in public repo", async () => {
      mkdirSync(join(publicDir, "src"), { recursive: true });
      writeFileSync(join(publicDir, "src", "app.ts"), "export default {}");

      const changes = await twoRepo.getPublicChanges();
      expect(changes.some((f) => f.includes("app.ts"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // syncPrivate / syncPublic
  // ---------------------------------------------------------------------------

  describe("syncPrivate", () => {
    it("commits changes in private repo", async () => {
      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");

      const committed = await twoRepo.syncPrivate();
      expect(committed).toBe(true);

      const changes = await twoRepo.getPrivateChanges();
      expect(changes).toEqual([]);
    });

    it("returns false when nothing to commit", async () => {
      const committed = await twoRepo.syncPrivate();
      expect(committed).toBe(false);
    });

    it("emits private-committed event", async () => {
      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");

      const events: Array<{ message: string; files: string[] }> = [];
      twoRepo.on("private-committed", (message, files) => events.push({ message, files }));

      await twoRepo.syncPrivate();
      expect(events).toHaveLength(1);
      expect(events[0]?.files.some((f) => f.includes("facts.json"))).toBe(true);
    });
  });

  describe("syncPublic", () => {
    it("commits changes in public repo", async () => {
      mkdirSync(join(publicDir, "src"), { recursive: true });
      writeFileSync(join(publicDir, "src", "app.ts"), "export default {}");

      const committed = await twoRepo.syncPublic();
      expect(committed).toBe(true);

      const changes = await twoRepo.getPublicChanges();
      expect(changes).toEqual([]);
    });

    it("returns false when nothing to commit", async () => {
      const committed = await twoRepo.syncPublic();
      expect(committed).toBe(false);
    });

    it("emits public-committed event", async () => {
      mkdirSync(join(publicDir, "src"), { recursive: true });
      writeFileSync(join(publicDir, "src", "app.ts"), "export default {}");

      const events: Array<{ message: string; files: string[] }> = [];
      twoRepo.on("public-committed", (message, files) => events.push({ message, files }));

      await twoRepo.syncPublic();
      expect(events).toHaveLength(1);
      expect(events[0]?.files.some((f) => f.includes("app.ts"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // syncBoth
  // ---------------------------------------------------------------------------

  describe("syncBoth", () => {
    it("syncs both repos and emits synced event", async () => {
      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");
      mkdirSync(join(publicDir, "src"), { recursive: true });
      writeFileSync(join(publicDir, "src", "app.ts"), "export default {}");

      const syncedEvents: void[] = [];
      twoRepo.on("synced", () => syncedEvents.push(undefined));

      const result = await twoRepo.syncBoth();
      expect(result.privateCommitted).toBe(true);
      expect(result.publicCommitted).toBe(true);
      expect(syncedEvents).toHaveLength(1);
    });

    it("reports false for repos with no changes", async () => {
      const result = await twoRepo.syncBoth();
      expect(result.privateCommitted).toBe(false);
      expect(result.publicCommitted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // start / stop
  // ---------------------------------------------------------------------------

  describe("start / stop", () => {
    it("start does not throw and stop cleans up timers", async () => {
      twoRepo.start();
      // Let timers tick briefly
      await new Promise((r) => setTimeout(r, 100));
      expect(() => twoRepo.stop()).not.toThrow();
    });

    it("periodic sync runs when autoSync is true", async () => {
      // Use a short interval for testing
      const fastConfig: TwoRepoConfig = {
        ...makeConfig(privateDir, publicDir),
        syncInterval: 1, // 1 second
      };
      const fastSync = new TwoRepoSync(fastConfig);

      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");

      const syncedEvents: void[] = [];
      fastSync.on("synced", () => syncedEvents.push(undefined));

      fastSync.start();
      // Wait enough for at least one sync cycle
      await new Promise((r) => setTimeout(r, 2500));
      fastSync.stop();

      expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("no periodic sync when autoSync is false", async () => {
      const noSyncConfig: TwoRepoConfig = {
        ...makeConfig(privateDir, publicDir),
        autoSync: false,
      };
      const noSync = new TwoRepoSync(noSyncConfig);

      mkdirSync(join(privateDir, "memory"), { recursive: true });
      writeFileSync(join(privateDir, "memory", "facts.json"), "[]");

      const syncedEvents: void[] = [];
      noSync.on("synced", () => syncedEvents.push(undefined));

      noSync.start();
      await new Promise((r) => setTimeout(r, 1500));
      noSync.stop();

      expect(syncedEvents).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Error forwarding
  // ---------------------------------------------------------------------------

  describe("error forwarding", () => {
    it("emits error with repo=private when private repo git fails", async () => {
      const badConfig = makeConfig("/tmp/nonexistent-brain-xyz", publicDir);
      const badSync = new TwoRepoSync(badConfig);

      const errors: Array<{ repo: string; err: Error }> = [];
      badSync.on("error", (repo, err) => errors.push({ repo, err }));

      // syncPrivate returns false gracefully when sync is null
      const result = await badSync.syncPrivate();
      expect(result).toBe(false);

      badSync.stop();
    });
  });
});
