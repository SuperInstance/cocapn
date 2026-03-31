# Git Helper Plugin

Assists with Git workflow management including commit message generation, branch naming, PR descriptions, conflict resolution, and repository maintenance.

## What It Does

The git-helper plugin streamlines the Git workflow by automating repetitive tasks and enforcing team conventions. It generates conventional commit messages from diffs, suggests branch names based on the scope of changes, and crafts detailed PR descriptions with context.

## Features

### Conventional Commit Messages
Analyzes the staged diff and generates a commit message following the Conventional Commits specification:

```
type(scope): imperative description
```

The plugin determines the type from the nature of changes:
- New files or functions -> `feat`
- Bug fixes or error handling -> `fix`
- Comment or documentation changes -> `docs`
- Formatting, whitespace, imports -> `style`
- Code restructuring without behavior change -> `refactor`
- Performance improvements -> `perf`
- New or updated tests -> `test`
- Build, CI, dependency changes -> `chore` or `ci`

The scope is inferred from the directory or module where changes are concentrated.

### Branch Management
When starting new work, the plugin suggests a branch name based on the type of change:

```
feat/add-user-authentication
fix/login-redirect-loop
refactor/extract-validation-module
```

It also tracks stale branches and can clean up branches that have been merged into main.

### PR Description Generation
When opening a pull request, the plugin generates a description that includes:

1. **Summary** — What the PR does, derived from commit messages and diff analysis
2. **Changes** — Bullet list of key changes grouped by module
3. **Testing** — How the changes were tested, referencing test files
4. **Breaking Changes** — Any API or behavior changes that downstream consumers need to know about
5. **Related Issues** — Links to issues that this PR addresses

### Conflict Resolution Guidance
When merge conflicts are detected, the plugin:

1. Identifies the conflicting files and regions
2. Shows both versions with context
3. Suggests a resolution strategy (take ours, take theirs, or merge both)
4. Explains the reasoning behind each suggestion

### Commit Pattern Tracking
The post-commit hook analyzes each commit and records patterns in memory:

- Files that change together (coupling detection)
- Commit frequency per module (hotspot identification)
- Common commit types per developer (workflow insights)

## Usage

### Chat Commands
```
Write a commit message for my staged changes
```

```
Suggest a branch name for adding email notifications
```

```
Generate a PR description for the current branch
```

```
Which branches are stale and safe to delete?
```

```
Help me resolve the merge conflicts on feat/auth-flow
```

### Automatic Behaviors
- **Commit message validation** — When `commitFormat: "conventional"` is set, the plugin validates that commit messages follow the format
- **Post-commit analysis** — After each commit, patterns are recorded for future reference
- **Scheduled maintenance** — Stale branch detection runs on the configured cron schedule

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `commitFormat` | `conventional` | Expected commit message format |
| `autoSuggestBranchName` | true | Suggest branch names when starting new work |
| `autoGeneratePRDescription` | true | Generate PR description from branch commits |
| `trackCommitPatterns` | true | Record commit patterns in brain memory |
| `staleBranchThresholdDays` | 30 | Days before a branch is considered stale |
| `maxDiffContextLines` | 5 | Context lines to include in diff analysis |

## Memory Integration

The git-helper plugin reads and writes to brain memory:

- **Reads** `dev.commitConvention` to know the expected format
- **Reads** `dev.branchingStrategy` to understand the team's workflow
- **Writes** commit patterns to `memories.json` for trend analysis
- **Reads** past memories to provide context-aware suggestions

## Permissions

This plugin requires:
- `git.diff` — Analyze code changes
- `git.log` — Access commit history
- `git.status` — Check working tree state
- `git.branch` — List and manage branches
- `git.remote` — Access remote repository info
- `filesystem.read` — Read file contents for context
- `brain.facts.read` — Read team conventions
- `brain.memories.read` — Access past commit patterns
- `brain.memories.write` — Store new commit patterns
