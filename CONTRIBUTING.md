# Contributing to Cocapn

Thanks for your interest! Cocapn is an open-source agent runtime by [Superinstance](https://github.com/superinstance).

## Quick Start

1. Fork the repo
2. Clone your fork
3. `npm install` (installs all workspace packages)
4. `npm run build` (build all packages)
5. `npm test` (run all tests)

## Development

### Project Structure
```
packages/
  local-bridge/    — Core runtime (bridge, brain, skills, fleet)
  cloud-agents/    — Cloudflare Worker deployment
  cli/             — cocapn CLI
  create-cocapn/   — Scaffolding tool
  ui/              — React dashboard
  ui-minimal/      — Minimal chat UI (HTML only)
  templates/       — Built-in templates
  protocols/       — MCP + A2A + Fleet protocols
  marketplace/     — Plugin marketplace page
  landing/         — Landing page
```

### Testing
- Unit tests: `npx vitest run` (in any package)
- E2E tests: `npx vitest run tests/e2e/`
- All tests: `npm test`

### Code Style
- TypeScript with strict mode
- 2-space indentation
- Single quotes
- Conventional commits (`feat:`, `fix:`, `docs:`, etc.)

## Pull Requests

1. Keep changes focused and small
2. Include tests for new features
3. Update docs if needed
4. Sign your commits: `git commit -s`

## Issues

Bug reports and feature requests welcome! Please include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (Node version, OS)

## License

By contributing, you agree that your code will be licensed under the MIT License.

---

Built by [Superinstance](https://github.com/superinstance).
