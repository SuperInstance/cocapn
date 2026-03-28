#!/usr/bin/env node
/**
 * cocapn-brain CLI entry point.
 *
 * Usage:
 *   npx cocapn-brain fact set name "Alice"
 *   npx cocapn-brain fact get name
 *   npx cocapn-brain wiki add ./my-notes.md
 *   npx cocapn-brain task add "Write release notes" --desc "Cover v0.2 features"
 */

import { runBrainCli } from "./cli/brain.js";

runBrainCli();
