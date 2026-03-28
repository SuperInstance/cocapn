#!/usr/bin/env node
/**
 * Renames .js files in dist/cjs to .cjs so that Node.js resolves them
 * correctly when the package root has "type": "module".
 */

import { readdirSync, renameSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CJS_DIR = new URL("../dist/cjs", import.meta.url).pathname;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith(".js")) {
      const newPath = fullPath.replace(/\.js$/, ".cjs");
      // Fix internal require() calls that reference .js siblings
      let content = readFileSync(fullPath, "utf8");
      content = content.replace(/require\("(\..*?)\.js"\)/g, 'require("$1.cjs")');
      writeFileSync(newPath, content);
      // Remove old .js file
      renameSync(fullPath, fullPath); // no-op placeholder
      writeFileSync(fullPath, ""); // clear it; rename is safer
    }
  }
}

walk(CJS_DIR);
console.log("CJS extension fix complete.");
