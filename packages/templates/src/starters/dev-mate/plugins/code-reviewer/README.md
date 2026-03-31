# Code Reviewer Plugin

Automated code review that analyzes diffs for security vulnerabilities, performance regressions, style violations, correctness issues, and maintainability concerns.

## What It Does

The code-reviewer plugin hooks into the Git workflow to provide automated feedback on code changes. It operates at two points:

1. **Pre-commit** — Quick checks on staged files before a commit is finalized
2. **On-demand review** — Full analysis triggered by chat commands or pull request events

## Review Categories

### Security
- SQL injection via string interpolation
- XSS through unsanitized user input in HTML responses
- Hardcoded secrets, API keys, or tokens
- Insecure cryptographic operations (MD5, SHA1 for passwords)
- Missing authentication or authorization checks on sensitive endpoints
- Path traversal vulnerabilities in file operations

### Performance
- N+1 database queries in loops
- Missing indexes on frequently queried columns
- Unbounded result sets without pagination
- Synchronous operations that should be async (file I/O, network calls)
- Memory leaks from event listeners or subscriptions not cleaned up
- Redundant re-renders in React components

### Style
- Mixed indentation (tabs vs spaces)
- Inconsistent quote style
- Missing or inconsistent doc comments on exported functions
- Function complexity (too many branches, too many parameters)
- Dead code or unused imports

### Correctness
- Unhandled promise rejections
- Race conditions in concurrent operations
- Off-by-one errors in loops and array indexing
- Missing error handling for expected failure cases
- Type narrowing issues in TypeScript

### Maintainability
- God functions exceeding 50 lines
- Deep nesting exceeding 4 levels
- Duplicated logic that should be extracted
- Magic numbers without named constants
- Missing tests for new code paths

## Usage

### Chat Command
```
Review the last 3 commits
```

Dev Mate will analyze the diff and return structured feedback grouped by severity.

### Automatic Review
When `autoReviewOnCommit` is enabled in the plugin config, every commit triggers a quick review. Critical issues block the commit; warnings and suggestions are logged.

### Pull Request Review
Configure the `on-message` hook to trigger a full review when a PR is opened or updated. The review output includes:

- Summary of changes analyzed
- Issues grouped by severity (critical, warning, info, suggestion)
- Suggested fixes with code snippets
- Overall assessment and merge recommendation

## Configuration

Edit the `config` section in `plugin.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxFileSize` | 500 | Max lines per file to review (skip larger files) |
| `severityLevels` | all | Which severity levels to report |
| `categories` | all | Which review categories to check |
| `autoReviewOnCommit` | true | Run quick review on every commit |
| `blockCommitOnCritical` | true | Block commits when critical issues found |
| `respectProjectConventions` | true | Read facts.json for team style preferences |

## Memory Integration

The code-reviewer reads from brain memory to learn team conventions:

- `dev.indentStyle` — Checks indentation matches team preference
- `dev.quoteStyle` — Validates quote style consistency
- `dev.commitConvention` — Validates commit message format
- Review patterns from `memories.json` — Avoids repeating feedback that was previously accepted

## Permissions

This plugin requires:
- `git.diff` — Read code diffs for analysis
- `git.log` — Access commit history for context
- `filesystem.read` — Read file contents for full-context review
- `brain.facts.read` — Read team conventions from memory
- `brain.memories.read` — Check past review outcomes
