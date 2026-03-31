# CI/CD and Deployment Pipelines

This document describes the continuous integration and continuous deployment setup, pipeline stages, deployment environments, and operational runbooks for common scenarios.

## Pipeline Overview

```
Push to PR            Push to main           Tag v*
   │                     │                    │
   ▼                     ▼                    ▼
┌─────────┐       ┌──────────────┐     ┌──────────────┐
│  Lint    │       │  Full Test   │     │  Build +     │
│  Type    │       │  Suite       │     │  Publish     │
│  Check   │       │  Coverage    │     │  Deploy to   │
└─────────┘       │  Lint + Type │     │  Production  │
                  └──────┬───────┘     └──────────────┘
                         │
                  ┌──────▼───────┐
                  │  Auto Deploy │
                  │  to Staging  │
                  └──────────────┘
```

## Environments

| Environment | Branch | URL | Purpose |
|-------------|--------|-----|---------|
| Local | Any | `localhost:8787` | Development and manual testing |
| Staging | `main` | `staging.example.com` | QA, integration testing, demo |
| Production | `v*` tags | `example.com` | Live users |

## CI Pipeline (GitHub Actions)

### Pull Request Checks
Triggered on every push to an open pull request. Must pass before merge is allowed.

1. **Lint** — ESLint on all staged files
2. **Type Check** — `tsc --noEmit` across all packages
3. **Unit Tests** — Vitest with coverage report uploaded as artifact
4. **Build Verification** — Ensure the project builds without errors

### Main Branch Checks
Triggered on every push to `main`. Includes all PR checks plus:

5. **Integration Tests** — Tests that require database and external services
6. **Coverage Gate** — Fail if coverage drops below configured thresholds
7. **Deploy to Staging** — Automatic deployment to staging environment
8. **Notify Team** — Slack notification with build status and staging URL

### Release Pipeline
Triggered on tag push (`v1.2.3` format).

9. **Build Production Artifacts** — Optimized bundles, Docker images
10. **Run Full Test Suite** — Unit + Integration + E2E
11. **Deploy to Production** — Blue-green deployment with health checks
12. **Smoke Tests** — Verify critical paths on production after deploy
13. **Create GitHub Release** — Auto-generated from conventional commits
14. **Notify Team** — Slack notification with release notes and production URL

## Deployment Strategy

### Blue-Green Deployment
Maintains two identical production environments. Traffic switches between them during deployment.

1. Current production is "blue". Deploy new version to "green".
2. Run health checks against green. If all pass, switch DNS/load balancer to green.
3. Monitor for 5 minutes. If issues arise, switch back to blue instantly.
4. After 30 minutes of stability, blue becomes the standby for the next deploy.

### Rollback Procedure
If a deployment fails or causes issues in production:

1. **Immediate rollback** — Switch traffic back to the previous environment
2. **Assess the failure** — Check logs, metrics, and error rates
3. **Fix forward or revert** — If the fix is simple, create a hotfix branch. If not, revert the commit.
4. **Document** — Create a post-incident summary. Update runbooks if needed.

```bash
# Emergency rollback (switch back to previous deployment)
./scripts/rollback.sh production

# Revert a specific commit
git revert <commit-sha>
git push origin main
```

## Docker Configuration

### Build
```bash
# Build the production image
docker build -t app:latest .

# Build with specific version tag
docker build -t app:v1.2.3 .
```

### Run Locally
```bash
# Start all services (app, database, redis)
docker-compose up -d

# View logs
docker-compose logs -f app

# Run tests in the container
docker-compose exec app npx vitest run
```

### Environment Variables
All runtime configuration comes from environment variables. Never hardcode values.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development`, `test`, `production` |
| `PORT` | No | Server port (default: 8787) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

## Monitoring and Observability

### Health Check Endpoint
```
GET /health
```
Returns status of all dependencies (database, redis, external APIs) with response times.

### Structured Logging
All logs are JSON-formatted with consistent fields:

```json
{
  "timestamp": "2026-03-30T12:00:00Z",
  "level": "info",
  "service": "api-gateway",
  "traceId": "abc123",
  "message": "Request completed",
  "duration": 45,
  "statusCode": 200,
  "method": "GET",
  "path": "/api/v1/users"
}
```

### Key Metrics
- Request rate, error rate, and latency (p50, p95, p99) per endpoint
- Database connection pool utilization
- Redis cache hit/miss ratio
- Memory and CPU usage per container
- Deployment frequency and lead time

### Alerting Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 1% over 5 min | > 5% over 1 min |
| p99 latency | > 2 seconds | > 5 seconds |
| Database connections | > 80% pool | > 95% pool |
| Memory usage | > 80% | > 90% |
| Disk usage | > 70% | > 85% |

## Scheduled Operations

| Job | Schedule | Command |
|-----|----------|---------|
| Dependency audit | Monday 09:00 UTC | `npm audit --production` |
| Coverage report | Friday 18:00 UTC | `npx vitest run --coverage` |
| Stale branch cleanup | Monday 10:00 UTC | `git branch --merged main` |
| Database backup | Daily 03:00 UTC | `pg_dump` to S3 |

## Common Operational Tasks

### Database Migration
```bash
# Generate a migration from schema changes
npx drizzle-kit generate

# Apply migrations to staging
docker-compose exec app npx drizzle-kit push

# Apply migrations to production (via CI)
git tag v1.2.3 && git push --tags
```

### Secret Rotation
```bash
# Update a secret (stored in OS keychain)
cocapn secret set JWT_SECRET

# Redeploy to pick up the new value
cocapn deploy --env production
```
