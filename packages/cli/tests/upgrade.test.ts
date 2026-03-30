/**
 * Tests for cocapn upgrade command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseSemver,
  semverCompare,
  formatSemver,
  checkForUpdates,
  UpgradeCheckResult,
} from "../src/commands/upgrade.js";

// ─── parseSemver ────────────────────────────────────────────────────────────

describe("parseSemver", () => {
  it("parses standard semver", () => {
    const v = parseSemver("1.2.3");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses semver with v prefix", () => {
    const v = parseSemver("v1.2.3");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses semver with prerelease", () => {
    const v = parseSemver("1.2.3-beta.1");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3, prerelease: "beta.1" });
  });

  it("trims whitespace", () => {
    const v = parseSemver("  1.2.3  ");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("returns null for invalid input", () => {
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("1.2.3.4")).toBeNull();
  });
});

// ─── semverCompare ──────────────────────────────────────────────────────────

describe("semverCompare", () => {
  const v = (s: string) => parseSemver(s)!;

  it("returns 0 for equal versions", () => {
    expect(semverCompare(v("1.2.3"), v("1.2.3"))).toBe(0);
  });

  it("compares major versions", () => {
    expect(semverCompare(v("2.0.0"), v("1.0.0"))).toBeGreaterThan(0);
    expect(semverCompare(v("1.0.0"), v("2.0.0"))).toBeLessThan(0);
  });

  it("compares minor versions", () => {
    expect(semverCompare(v("1.2.0"), v("1.1.0"))).toBeGreaterThan(0);
    expect(semverCompare(v("1.1.0"), v("1.2.0"))).toBeLessThan(0);
  });

  it("compares patch versions", () => {
    expect(semverCompare(v("1.2.3"), v("1.2.2"))).toBeGreaterThan(0);
    expect(semverCompare(v("1.2.2"), v("1.2.3"))).toBeLessThan(0);
  });

  it("treats prerelease as lower than release", () => {
    expect(semverCompare(v("1.2.3"), v("1.2.3-beta"))).toBeGreaterThan(0);
    expect(semverCompare(v("1.2.3-beta"), v("1.2.3"))).toBeLessThan(0);
  });

  it("compares prerelease strings", () => {
    expect(semverCompare(v("1.2.3-beta.2"), v("1.2.3-beta.1"))).toBeGreaterThan(0);
    expect(semverCompare(v("1.2.3-alpha"), v("1.2.3-beta"))).toBeLessThan(0);
  });
});

// ─── formatSemver ───────────────────────────────────────────────────────────

describe("formatSemver", () => {
  it("formats without prerelease", () => {
    expect(formatSemver({ major: 1, minor: 2, patch: 3 })).toBe("1.2.3");
  });

  it("formats with prerelease", () => {
    expect(formatSemver({ major: 1, minor: 2, patch: 3, prerelease: "beta.1" })).toBe(
      "1.2.3-beta.1",
    );
  });
});

// ─── checkForUpdates ────────────────────────────────────────────────────────

describe("checkForUpdates", () => {
  it("throws when current version cannot be parsed", () => {
    expect(() => checkForUpdates()).toThrow();
  });
});
