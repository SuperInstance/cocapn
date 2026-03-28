#!/usr/bin/env node
/**
 * cocapn-init — interactive setup script
 *
 * Creates a public UI repo and a private brain repo for a new Cocapn instance,
 * copies the template files, and pushes the initial commit.
 *
 * Usage:
 *   node templates/init.js
 *   npx cocapn-init          # when published as a bin
 */

import { createInterface } from "readline";
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { homedir, tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── colours ─────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  green: "\x1b[32m",
  cyan:  "\x1b[36m",
  yellow:"\x1b[33m",
  red:   "\x1b[31m",
};
const ok   = (s) => console.log(`${c.green}✓${c.reset} ${s}`);
const info = (s) => console.log(`${c.cyan}→${c.reset} ${s}`);
const warn = (s) => console.log(`${c.yellow}!${c.reset} ${s}`);
const fail = (s) => { console.error(`${c.red}✗${c.reset} ${s}`); process.exit(1); };
const hr   = ()  => console.log(`${c.dim}${"─".repeat(60)}${c.reset}`);

// ─── readline helpers ─────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue) {
  return new Promise((resolve) => {
    const prompt = defaultValue
      ? `${question} ${c.dim}[${defaultValue}]${c.reset} `
      : `${question} `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function askSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(`${question} `);
    // Disable echo
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    let value = "";
    const onData = (ch) => {
      const char = ch.toString();
      if (char === "\r" || char === "\n") {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(value);
      } else if (char === "\x7f" || char === "\b") {
        value = value.slice(0, -1);
      } else if (char === "\x03") {
        process.exit(1);
      } else {
        value += char;
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(`${question} ${c.dim}[${hint}]${c.reset}`);
  if (!answer) return defaultYes;
  return /^y/i.test(answer);
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────

async function ghFetch(path, token, options = {}) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function verifyToken(token) {
  const { ok, body } = await ghFetch("/user", token);
  if (!ok) return null;
  return body.login;
}

async function createRepo(token, owner, name, isPrivate, description) {
  const { ok, status, body } = await ghFetch("/user/repos", token, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: false,
    }),
  });
  if (ok) return body;
  if (status === 422) {
    // Might already exist — check
    const check = await ghFetch(`/repos/${owner}/${name}`, token);
    if (check.ok) return check.body;
  }
  throw new Error(body.message ?? `GitHub API error ${status}`);
}

// ─── file utilities ───────────────────────────────────────────────────────────

function copyDir(src, dest, replacements) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath  = join(src, entry);
    const destPath = join(dest, entry);
    const stat     = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      const ext = entry.split(".").pop();
      const textExts = new Set(["md","yml","yaml","json","js","ts","tsx","jsx","css","html","txt","toml","gitignore","gitkeep","cname","env"]);
      if (textExts.has(ext?.toLowerCase() ?? "") || !ext) {
        let content = readFileSync(srcPath, "utf8");
        for (const [placeholder, value] of Object.entries(replacements)) {
          content = content.replaceAll(`{{${placeholder}}}`, value);
        }
        writeFileSync(destPath, content, "utf8");
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args[0]} failed`);
  }
  return result.stdout?.trim();
}

function hasCmd(cmd) {
  try { execSync(`which ${cmd}`, { stdio: "ignore" }); return true; }
  catch { return false; }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}${c.cyan}Cocapn Setup${c.reset}\n`);
  console.log("This script creates your public UI repo and private brain repo on GitHub,\nconfigures them, and pushes an initial commit.\n");
  hr();

  // ── 1. Prerequisites ────────────────────────────────────────────────────────

  if (!hasCmd("git")) fail("git is not installed. Install it from https://git-scm.com/");
  ok("git found");

  // ── 2. GitHub PAT ───────────────────────────────────────────────────────────

  console.log(`\n${c.bold}GitHub Personal Access Token${c.reset}`);
  console.log(`${c.dim}Needs scopes: repo, workflow${c.reset}\n`);

  let token = process.env.GITHUB_TOKEN ?? "";
  let githubLogin = null;

  if (token) {
    githubLogin = await verifyToken(token);
    if (githubLogin) {
      ok(`Token from GITHUB_TOKEN — authenticated as ${c.bold}${githubLogin}${c.reset}`);
    } else {
      warn("GITHUB_TOKEN is invalid. Please enter a new one.");
      token = "";
    }
  }

  while (!githubLogin) {
    token = await askSecret("GitHub PAT:");
    if (!token) { warn("Token cannot be empty."); continue; }
    info("Verifying token…");
    githubLogin = await verifyToken(token);
    if (!githubLogin) {
      warn("Token verification failed. Check scopes and try again.");
    } else {
      ok(`Authenticated as ${c.bold}${githubLogin}${c.reset}`);
    }
  }

  // ── 3. User preferences ─────────────────────────────────────────────────────

  hr();
  console.log(`\n${c.bold}Configuration${c.reset}\n`);

  const username = await ask("GitHub username:", githubLogin);

  const domainChoices = [
    "makerlog","devlog","shiplog","captain","harbourmaster",
    "oracle","navigator","pilot","engineer","architect",
  ];
  console.log(`\nAvailable domains: ${c.dim}${domainChoices.join(", ")}${c.reset}`);
  let domain = await ask("Domain:", "makerlog");
  while (!domainChoices.includes(domain)) {
    warn(`Unknown domain. Choose one of: ${domainChoices.join(", ")}`);
    domain = await ask("Domain:", "makerlog");
  }

  const publicRepoName  = await ask("Public repo name:", `${username}.${domain}.ai`);
  const privateRepoName = await ask("Private repo name:", `${username}-brain`);

  const outputDir = await ask("Local parent directory:", join(homedir(), "cocapn"));

  hr();
  console.log(`\n${c.bold}Summary${c.reset}\n`);
  console.log(`  GitHub user   : ${c.bold}${username}${c.reset}`);
  console.log(`  Domain        : ${c.bold}${domain}${c.reset}`);
  console.log(`  Public repo   : ${c.bold}github.com/${username}/${publicRepoName}${c.reset} (public)`);
  console.log(`  Private repo  : ${c.bold}github.com/${username}/${privateRepoName}${c.reset} (private)`);
  console.log(`  Local path    : ${c.bold}${outputDir}${c.reset}`);
  console.log();

  if (!await confirm("Proceed?")) {
    console.log("Aborted.");
    rl.close();
    process.exit(0);
  }

  // ── 4. Create GitHub repos ──────────────────────────────────────────────────

  hr();
  console.log();
  info("Creating GitHub repositories…");

  let publicRepo, privateRepo;

  try {
    publicRepo = await createRepo(
      token, username, publicRepoName, false,
      `${domain} — Cocapn public UI for ${username}`
    );
    ok(`Public repo: ${publicRepo.html_url}`);
  } catch (err) {
    fail(`Failed to create public repo: ${err.message}`);
  }

  try {
    privateRepo = await createRepo(
      token, username, privateRepoName, true,
      `${username}-brain — Cocapn private memory store`
    );
    ok(`Private repo: ${privateRepo.html_url}`);
  } catch (err) {
    fail(`Failed to create private repo: ${err.message}`);
  }

  // ── 5. Clone + copy templates ────────────────────────────────────────────────

  mkdirSync(outputDir, { recursive: true });

  const publicDir  = join(outputDir, publicRepoName);
  const privateDir = join(outputDir, privateRepoName);

  const replacements = { username, domain };

  // Public
  info("Setting up public repo…");
  if (!existsSync(publicDir)) {
    git(outputDir, "clone", publicRepo.clone_url, publicRepoName);
  }
  copyDir(join(__dirname, "public"), publicDir, replacements);
  // Write CNAME with real hostname
  writeFileSync(join(publicDir, "CNAME"), `${username}.${domain}.ai\n`, "utf8");
  // Append fleet section with real hostname (template omits it to stay schema-valid)
  const cocapnYml = join(publicDir, "cocapn.yml");
  const fleetSection = `\nfleet:\n  domains:\n    - "${username}.${domain}.ai"\n`;
  writeFileSync(cocapnYml, readFileSync(cocapnYml, "utf8") + fleetSection, "utf8");

  try {
    git(publicDir, "add", "-A");
    git(publicDir, "commit", "-m", "Cocapn: initialise public UI template");
    git(publicDir, "push", "-u", "origin", "HEAD");
    ok("Public repo initialised and pushed");
  } catch (err) {
    // If nothing to commit (repo had content), carry on
    if (!err.message.includes("nothing to commit")) {
      warn(`Public repo push warning: ${err.message}`);
    } else {
      ok("Public repo already up to date");
    }
  }

  // Private
  info("Setting up private repo…");
  const privateCloneUrl = privateRepo.clone_url.replace(
    "https://",
    `https://${token}@`
  );
  if (!existsSync(privateDir)) {
    git(outputDir, "clone", privateCloneUrl, privateRepoName);
  }
  copyDir(join(__dirname, "private"), privateDir, replacements);

  try {
    git(privateDir, "add", "-A");
    git(privateDir, "commit", "-m", "Cocapn: initialise private brain template");
    git(privateDir, "push", "-u", "origin", "HEAD");
    ok("Private repo initialised and pushed");
  } catch (err) {
    if (!err.message.includes("nothing to commit")) {
      warn(`Private repo push warning: ${err.message}`);
    } else {
      ok("Private repo already up to date");
    }
  }

  // ── 6. GitHub Pages ─────────────────────────────────────────────────────────

  info("Enabling GitHub Pages for the public repo…");
  const pagesRes = await ghFetch(
    `/repos/${username}/${publicRepoName}/pages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ build_type: "workflow" }),
    }
  );
  if (pagesRes.ok || pagesRes.status === 409) {
    ok("GitHub Pages configured (source: GitHub Actions)");
  } else {
    warn(`Could not auto-enable Pages (${pagesRes.status}). Enable it manually in Settings → Pages.`);
  }

  // ── 7. Next steps ────────────────────────────────────────────────────────────

  hr();
  console.log(`\n${c.bold}${c.green}All done!${c.reset}\n`);

  console.log(`${c.bold}Your repos${c.reset}`);
  console.log(`  Public UI   : ${publicRepo.html_url}`);
  console.log(`  Private brain: ${privateRepo.html_url}`);
  console.log();

  console.log(`${c.bold}Next steps${c.reset}\n`);

  console.log(`${c.bold}1. Generate an age identity${c.reset} (if you don't have one):`);
  console.log(`   ${c.cyan}age-keygen -o ~/.config/cocapn/identity.age${c.reset}`);
  console.log(`   Then copy the public key into ${c.dim}${privateDir}/cocapn/config.yml${c.reset}\n`);

  console.log(`${c.bold}2. Install the bridge${c.reset}:`);
  console.log(`   ${c.cyan}npm install -g @cocapn/local-bridge${c.reset}\n`);

  console.log(`${c.bold}3. Start the bridge${c.reset}:`);
  console.log(`   ${c.cyan}cocapn-bridge --repo ${privateDir}${c.reset}\n`);

  console.log(`${c.bold}4. Open the UI${c.reset}:`);
  console.log(`   ${c.cyan}cd ${publicDir} && npm install && npm run dev${c.reset}`);
  console.log(`   Or wait for GitHub Pages to deploy: ${c.cyan}https://${username}.github.io/${publicRepoName}/${c.reset}\n`);

  console.log(`${c.bold}5. Connect${c.reset}:`);
  console.log(`   Click ${c.bold}Connect to local bridge${c.reset} in the UI and paste your GitHub PAT.\n`);

  rl.close();
}

main().catch((err) => {
  fail(err.message);
});
