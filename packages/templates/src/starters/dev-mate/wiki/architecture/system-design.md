# Architecture Decisions and System Design

This document records architectural decisions, system design patterns, and the rationale behind key technical choices. All significant decisions should be documented here in Architecture Decision Record (ADR) format.

## ADR Format

Every architecture decision should include:

```
## ADR-NNN: Title

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- **Date:** YYYY-MM-DD
- **Decision:** What was decided
- **Context:** Why this decision was needed
- **Alternatives Considered:** What other options were evaluated
- **Consequences:** Positive and negative outcomes of this decision
```

## Current Architecture Overview

```
                        ┌─────────────┐
                        │   Client     │
                        │  (React SPA) │
                        └──────┬───────┘
                               │ HTTPS
                        ┌──────▼───────┐
                        │  API Gateway  │
                        │  (Node.js)    │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
       │  Auth Service │ │ User Service │ │ Notification│
       │              │ │              │ │   Service    │
       └──────┬───────┘ └──────┬───────┘ └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   PostgreSQL         │
                    │   (Primary + Replica)│
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Redis Cache        │
                    │   (Sessions + Data)  │
                    └─────────────────────┘
```

## ADR-001: Monorepo with TypeScript

- **Status:** Accepted
- **Date:** 2026-01-15
- **Decision:** Use a monorepo structure with TypeScript for all packages.
- **Context:** The team is small (3 developers) and needs to move fast. Sharing types between frontend and backend eliminates drift. A single CI pipeline simplifies deployment.
- **Alternatives Considered:** Polyrepo with shared npm packages, microservices in different languages.
- **Consequences:** Simpler dependency management and type sharing. Repository may grow large over time — mitigation with path-based builds. All team members need TypeScript proficiency.

## ADR-002: PostgreSQL as Primary Database

- **Status:** Accepted
- **Date:** 2026-01-15
- **Decision:** Use PostgreSQL as the primary relational data store with Redis for caching and session management.
- **Context:** The application needs ACID transactions for user data and payments. Query patterns are well-understood and relational. Redis is needed for session storage and rate limiting.
- **Alternatives Considered:** MongoDB (document model), DynamoDB (managed NoSQL), SQLite (simpler but no concurrent writes).
- **Consequences:** Strong consistency guarantees. Mature tooling and ecosystem. Team has existing PostgreSQL expertise. Schema migrations require careful planning.

## ADR-003: Event-Driven Notification System

- **Status:** Accepted
- **Date:** 2026-03-20
- **Decision:** Use Server-Sent Events (SSE) for real-time notifications, fed by Redis pub/sub.
- **Context:** Notifications are server-to-client only. The team already uses Redis. WebSocket adds complexity (sticky sessions, connection state) that is not justified for one-directional data flow.
- **Alternatives Considered:** Polling (wasteful), WebSocket (overkill for one-directional), Third-party (Pusher, Firebase — adds vendor dependency).
- **Consequences:** Simple implementation leveraging existing Redis infrastructure. If bidirectional needs arise, the SSE endpoint can upgrade to WebSocket without changing the backend event pipeline. See memory entry mem-003 for full discussion.

## ADR-004: API Design with REST

- **Status:** Accepted
- **Date:** 2026-02-01
- **Decision:** Use RESTful API design with JSON payloads. Version the API via URL path prefix (`/api/v1/`).
- **Context:** The API is consumed by a single SPA frontend. REST provides simplicity and good tooling support. GraphQL was considered but the data shapes are predictable and not deeply nested.
- **Alternatives Considered:** GraphQL (flexible queries but added complexity), gRPC (performant but poor browser support), tRPC (type-safe but couples frontend and backend).
- **Consequences:** Standard HTTP semantics (caching, status codes, methods). Easy to document with OpenAPI. Versioning via URL path is straightforward but requires maintaining multiple route handlers during migrations.

## Design Principles

### Separation of Concerns
Each module handles one responsibility. Services contain business logic. Routes handle HTTP parsing and response formatting. Repositories manage database queries.

### Dependency Injection
Services receive their dependencies through constructors, not by importing them directly. This enables testing with mocks and swapping implementations without modifying business logic.

```typescript
// Service receives repository as a dependency
class UserService {
  constructor(private userRepo: UserRepository) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findById(id)
  }
}
```

### Error Handling Strategy
- **Expected errors** (validation, not found, unauthorized) return structured error responses with codes
- **Unexpected errors** (database down, network failure) are caught by a global error handler, logged with context, and return a generic 500 response
- **Never expose internal details** (stack traces, SQL queries, file paths) in error responses

### Configuration Management
- Environment-specific values (database URLs, API keys) come from environment variables
- Application defaults are defined in `config.yml`
- Secrets are managed via `cocapn secret set` and stored in the OS keychain
- No secrets in code, no secrets in Git

## Performance Considerations

- Database queries use connection pooling (max 20 connections)
- Frequently accessed data is cached in Redis with TTL of 300 seconds
- API responses include appropriate cache headers (`ETag`, `Cache-Control`)
- Heavy operations are offloaded to background jobs (scheduled via the Cocapn scheduler)
- Frontend uses code splitting and lazy loading for route-level chunks
