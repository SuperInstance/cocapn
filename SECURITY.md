# Security Policy

## Reporting Vulnerabilities

Please **do not** open a public GitHub issue for security vulnerabilities.

Email **security@cocapn.io** with:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations you have already identified

We will acknowledge receipt within **72 hours** and aim to issue a fix or mitigation within 14 days for critical issues.

---

## age Encryption

Cocapn uses [age](https://age-encryption.org/) to encrypt secrets stored in the private repo.
All encrypted files have the `.age` extension (e.g. `secrets/jwt-fleet.age`).

### Generating a keypair

```sh
# Install age (https://github.com/FiloSottile/age)
age-keygen -o ~/.config/cocapn/identity.age
```

`age-keygen` prints the public key (recipient) to stdout and writes the private key to the file you specify.

**Rules for the private key:**

1. Never commit `~/.config/cocapn/identity.age` to any repository.
2. Store it on the machine that runs the local bridge only.
3. Back it up to an offline medium (USB drive, printed paper key) and store securely.

The public key (recipient) is safe to share — it is stored in `cocapn/config.yml` inside the private repo so the bridge knows which key to encrypt new secrets to.

### Secret rotation

To rotate a secret, use the built-in CLI command:

```sh
cocapn-bridge secret rotate
```

This re-encrypts every secret in `secrets/` with the current recipient key. Use it after:
- Suspecting key compromise
- Revoking an old key and generating a new one
- Onboarding a new machine

---

## Known Issue: PAT Embedded in `.git/config`

During `cocapn-bridge init`, the GitHub Personal Access Token (PAT) is temporarily embedded in the remote URL so the initial push can authenticate without prompting. The remote is set as:

```
https://oauth2:<PAT>@github.com/<user>/<repo>.git
```

**This means the raw PAT lives in `.git/config` on disk until you replace it.**

### Fix

After `cocapn-bridge init` completes, run this command in both the public and private repo directories:

```sh
git remote set-url origin https://github.com/{user}/{repo}.git
```

Future pushes will use your system credential helper (e.g. `gh auth login`) rather than the embedded token. Starting with bridge v0.2.0 this step is performed automatically by `cocapn-bridge init`.

---

## JWT Fleet Keys

Agent-to-agent authentication uses short-lived JWTs signed with an Ed25519 fleet key. The private signing key is **never** stored in plaintext:

- The key is generated locally by `cocapn-bridge secret init`.
- It is immediately encrypted with your age identity and stored as `secrets/jwt-fleet.age` in the private repo.
- The bridge decrypts it into memory at startup and discards it when the process exits.
- The corresponding public verification key is stored unencrypted in `cocapn/config.yml` for agent identity verification.

---

## Scope of the Security Model

| Asset | Encrypted? | Where stored |
|---|---|---|
| age private key | No (protect via filesystem perms) | `~/.config/cocapn/identity.age` (local only) |
| JWT fleet signing key | Yes (age) | `secrets/jwt-fleet.age` in private repo |
| GitHub PAT | No — use credential helper | `~/.config/gh/hosts.yml` (gh CLI) or keychain |
| Memory / notes | No | Private repo (access-controlled via GitHub) |
| Module config | No | Private repo |
| UI / public content | No | Public repo (world-readable by design) |

**What is encrypted:** secrets that would grant broad access if leaked (signing keys, API tokens you explicitly encrypt via `cocapn-bridge secret set`).

**What is not encrypted:** your notes, tasks, memory files. These are protected by GitHub repository access controls (private repo), not cryptography. Anyone with access to the private repo can read them.

---

## Threat Model

### Local threat — physical access to your machine

**Scenario:** An attacker gains access to your laptop or desktop.

**Mitigations:**
- Full-disk encryption (FileVault, BitLocker, LUKS) is the primary defence.
- The age private key at `~/.config/cocapn/identity.age` is the crown jewel. Protect it with filesystem permissions (`chmod 600`).
- The bridge process decrypts secrets into memory only. There is no plaintext secrets file on disk.
- Rotate all secrets (`cocapn-bridge secret rotate`) and revoke the old age key after a suspected compromise.

### Remote threat — compromised GitHub account

**Scenario:** An attacker gains access to your GitHub account (stolen password, stolen session token, phishing).

**Mitigations:**
- Enable GitHub two-factor authentication (mandatory for all Cocapn users).
- Even with full read access to the private repo, an attacker cannot read age-encrypted secrets without the private key, which is never committed to GitHub.
- JWT fleet keys and any explicitly encrypted secrets remain protected.
- Unencrypted content (notes, memory, tasks) in the private repo is exposed — treat it as you would a private but not secret diary.
- Revoke the compromised PAT or OAuth token immediately via GitHub Settings → Developer settings.
- Rotate age keys and re-encrypt secrets after any suspected account compromise.
