#!/usr/bin/env node
/**
 * habit-tracker install hook
 * Creates initial habits.json and wiki/habits.md stubs.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const REPO_ROOT  = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const MODULE_DIR = process.env.COCAPN_MODULE_DIR ?? join(REPO_ROOT, "modules", "habit-tracker");

const habitsJson = join(MODULE_DIR, "habits.json");
if (!existsSync(habitsJson)) {
  writeFileSync(habitsJson, JSON.stringify({ habits: [], log: {} }, null, 2), "utf8");
  console.log("Created habits.json");
}

const wikiDir = join(REPO_ROOT, "wiki");
mkdirSync(wikiDir, { recursive: true });

const habitsWiki = join(wikiDir, "habits.md");
if (!existsSync(habitsWiki)) {
  writeFileSync(
    habitsWiki,
    `# Habit Tracker\n\nNo habits tracked yet. Ask your agent to add some!\n`,
    "utf8"
  );
  console.log("Created wiki/habits.md");
}

console.log("habit-tracker installed successfully.");
