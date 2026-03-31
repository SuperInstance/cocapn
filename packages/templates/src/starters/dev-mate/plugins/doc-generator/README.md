# Doc Generator Plugin

Automated documentation generation that keeps project documentation in sync with code changes. Creates ADRs, API documentation, README sections, and inline doc comments.

## What It Does

The doc-generator plugin ensures that documentation stays current and comprehensive. It generates documentation from code, identifies stale docs after code changes, and provides templates for structured decision records.

## Features

### Architecture Decision Records (ADRs)
Generates ADRs following the standard template when architectural decisions are discussed. Each ADR includes:

- **Title** — Short noun phrase describing the decision
- **Status** — Proposed, Accepted, Deprecated, or Superseded
- **Date** — When the decision was made
- **Context** — What forces are at play, what is the technical or business situation
- **Decision** — What was decided and why
- **Alternatives Considered** — What other options were evaluated with pros and cons
- **Consequences** — Positive, negative, and neutral outcomes of the decision

To create an ADR via chat:
```
Create an ADR for choosing Redis as the session store
```

### API Documentation
Generates OpenAPI-compatible documentation from route definitions and handler code. Extracts:

- HTTP method and path
- Request parameters (query, path, body) with types
- Response schemas with status codes
- Authentication requirements
- Example requests and responses

To generate API docs:
```
Generate API documentation for the /api/v1/users endpoints
```

### README Generation
Updates README sections based on project state. Can regenerate:

- Installation instructions from package.json and config
- Usage examples from code and tests
- Configuration table from config.yml schema
- Changelog from conventional commit history

To update the README:
```
Update the README with the latest API endpoints
```

### Inline Documentation
Generates JSDoc/TSDoc comments for exported functions, classes, and interfaces. Includes:

- Description of what the function does
- `@param` tags with types and descriptions
- `@returns` tag with type and what the return value represents
- `@throws` tag for documented error cases
- `@example` tag with usage snippet

To add doc comments:
```
Add doc comments to all exported functions in src/services/
```

### Stale Documentation Detection
After each commit, the plugin checks if any code changes affect documented areas:

- Public API endpoints that changed but API docs were not updated
- Exported functions whose signatures changed but doc comments were not updated
- Configuration options that changed but README config table was not updated
- Modules that were added or removed but architecture docs were not updated

## Usage

### Chat Commands
```
Create an ADR for switching from REST to GraphQL
```

```
Generate API docs for src/routes/
```

```
Add doc comments to the PaymentService class
```

```
Check if any documentation is out of date
```

```
Generate a README for the notification module
```

### Automatic Behaviors
- **Post-commit freshness check** — After each commit, scan for documentation that may be stale
- **Review augmentation** — During code review, flag missing or outdated documentation
- **ADR template population** — Pre-fill ADR template fields from discussion context

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `adrDirectory` | `wiki/architecture` | Directory where ADR files are stored |
| `apiDocFormat` | `openapi` | Output format for API documentation |
| `autoDetectStaleDocs` | true | Automatically check for stale docs after commits |
| `requireDocCommentsOnExports` | true | Flag exported symbols without doc comments |
| `adrTemplate` | `standard` | ADR template format (standard, alexandrian, madr) |
| `includeCodeExamples` | true | Include usage examples in generated documentation |

## Memory Integration

The doc-generator plugin reads and writes to brain memory:

- **Reads** `wiki/architecture/` for existing ADRs to avoid duplicates
- **Reads** `brain.memories` for past decisions and their rationale
- **Writes** new ADRs to `wiki/architecture/`
- **Reads** `brain.facts` for project conventions that affect documentation style

## Permissions

This plugin requires:
- `git.diff` — Detect what code changed to find stale documentation
- `git.log` — Access commit history for changelog generation
- `filesystem.read` — Read existing documentation and code
- `filesystem.write` — Write generated documentation files
- `brain.facts.read` — Read project conventions
- `brain.memories.read` — Access past decisions for ADR context
- `brain.memories.write` — Store documentation-related memories
