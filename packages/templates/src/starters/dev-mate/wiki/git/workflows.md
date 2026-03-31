# Git Workflow Strategies

This document covers the branching strategies and Git workflows suitable for different team sizes and project types. The Dev Mate starter defaults to GitHub Flow but supports alternatives.

## GitHub Flow (Recommended for most projects)

The simplest and most widely adopted workflow. Ideal for small teams (1-5 developers) and continuous deployment environments.

### Flow
1. `main` branch is always deployable
2. Create a feature branch from `main`: `feat/description`
3. Make commits with conventional commit messages
4. Open a Pull Request against `main`
5. Code review and discussion on the PR
6. Merge into `main` once approved
7. Delete the feature branch
8. Deploy from `main`

### Branch Naming Convention
```
feat/add-user-authentication
fix/login-redirect-loop
refactor/extract-validation-logic
docs/api-endpoint-reference
chore/upgrade-dependencies
test/payment-service-coverage
```

### Conventional Commit Messages
```
type(scope): imperative description

[optional body with context]

[optional footer with breaking changes or issues]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`

Examples:
```
feat(auth): add JWT refresh token rotation

Implements automatic token refresh when the access token
expires. The refresh token is rotated on each use to prevent
token reuse attacks.

Closes #142
```

```
fix(api): prevent SQL injection in user search query

Parameterized the WHERE clause in the user search endpoint.
String interpolation was being used for the email field.

Fixes #198
```

## Trunk-Based Development

Used by high-performing teams practicing continuous integration. All developers commit to `main` (trunk) multiple times per day.

### Flow
1. All work happens on short-lived feature branches (max 1-2 days)
2. Branches are merged to `main` via pull requests
3. Feature flags control incomplete features in production
4. No long-running branches — everything targets `main`

### When to Use
- Team has strong test coverage (80%+)
- CI pipeline runs in under 10 minutes
- Feature flags are in place for incomplete work
- Team commits to integrating at least daily

## Gitflow

A more structured workflow with dedicated branches for features, releases, and hotfixes. Suitable for projects with scheduled releases.

### Branches
- `main` — production-ready code, only merged from release or hotfix branches
- `develop` — integration branch for features
- `feat/*` — feature branches from `develop`
- `release/*` — release preparation branches from `develop`
- `hotfix/*` — urgent fixes from `main`

### When to Use
- Project has scheduled release cycles (not continuous deployment)
- Team needs to maintain multiple versions in production
- Strict QA process requires a dedicated release stabilization period

### Flow
1. Feature branches from `develop`, merge back to `develop`
2. When ready to release, create `release/v1.2.0` from `develop`
3. Bug fixes go on the release branch, merged back to `develop` and `main`
4. Tag `main` with version number on release
5. Hotfixes branch from `main`, merge to both `main` and `develop`

## Common Operations

### Rebasing vs Merging
- **Rebase** for local feature branches to keep a clean linear history
- **Merge** for PRs to preserve context about when and why changes were integrated
- Never rebase shared branches (main, develop, release branches)

### Interactive Rebase (clean up before PR)
```bash
# Squash, reorder, or edit commits before opening PR
git rebase -i main

# Push the rebased branch (force required since history changed)
git push --force-with-lease origin feat/my-feature
```

### Resolving Merge Conflicts
```bash
# Rebase your branch onto latest main
git fetch origin
git rebase origin/main

# Resolve conflicts in each file
# Stage resolved files
git add <resolved-file>
git rebase --continue

# If things go wrong, abort and try again
git rebase --abort
```

### Cherry-Pick (for hotfixes)
```bash
# Pick a specific commit to another branch
git checkout main
git cherry-pick abc1234

# Pick multiple commits
git cherry-pick abc1234 def5678
```

## PR Best Practices

1. **Small PRs** — Under 400 lines of changes. Easier to review thoroughly.
2. **Descriptive title** — Should complete the sentence "This PR will..."
3. **Context in description** — Why the change, what was considered, how to test.
4. **Self-review first** — Review your own diff before requesting others.
5. **Respond to all comments** — Acknowledge every review comment, even if just "done."
6. **Update based on feedback** — Push new commits, don't force-push during review.

## Git Hooks

This project uses the following hooks via Husky or Cocapn:

| Hook | Purpose |
|------|---------|
| `pre-commit` | Run linter and formatter on staged files |
| `commit-msg` | Validate conventional commit format |
| `pre-push` | Run full test suite |
| `post-merge` | Install dependencies if package.json changed |
