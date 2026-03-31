# Testing Strategies and Guide

This document outlines the testing approach for the project, including test types, tools, coverage expectations, and best practices. Dev Mate uses this as a reference when generating tests and analyzing coverage gaps.

## Testing Pyramid

The testing pyramid guides where to invest testing effort. More tests at the base (fast, isolated), fewer at the top (slow, integrated).

```
        /  E2E  \           Few, slow, expensive
       / Integration \      Moderate number
      /   Unit Tests  \     Many, fast, cheap
```

### Unit Tests (70% of test suite)
- Test individual functions, methods, and classes in isolation
- Mock all external dependencies (databases, APIs, filesystem)
- Run in milliseconds
- Should be deterministic — same input, same output, every time

### Integration Tests (20% of test suite)
- Test interactions between modules (service + database, API + business logic)
- Use real databases in test containers or in-memory equivalents
- Verify data flows correctly across module boundaries
- Run in seconds

### E2E Tests (10% of test suite)
- Test complete user flows through the application
- Use Playwright or Cypress against a running application
- Verify critical paths: signup, login, purchase, data export
- Run in minutes, execute in CI only

## Tools

### Vitest (Primary)
Used for all unit and integration tests. Configuration in `vitest.config.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserService } from '../src/services/user.js'

describe('UserService', () => {
  let service: UserService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    service = new UserService(mockRepo)
  })

  describe('findById', () => {
    it('should return user when found', async () => {
      const expected = { id: '1', name: 'Alice', email: 'alice@example.com' }
      mockRepo.findById.mockResolvedValue(expected)

      const result = await service.findById('1')

      expect(result).toEqual(expected)
      expect(mockRepo.findById).toHaveBeenCalledWith('1')
    })

    it('should return null when user not found', async () => {
      mockRepo.findById.mockResolvedValue(null)

      const result = await service.findById('999')

      expect(result).toBeNull()
    })
  })
})
```

### Playwright (E2E)
Used for end-to-end tests that simulate real user interactions.

```typescript
import { test, expect } from '@playwright/test'

test('user can log in with valid credentials', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[data-testid="email-input"]', 'alice@example.com')
  await page.fill('[data-testid="password-input"]', 'securepassword')
  await page.click('[data-testid="login-button"]')

  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('[data-testid="user-name"]')).toContainText('Alice')
})
```

## Coverage Expectations

| Module Type | Minimum Coverage | Target Coverage |
|-------------|-----------------|-----------------|
| Business logic / services | 80% | 90% |
| API endpoints | 75% | 85% |
| Utility functions | 90% | 95% |
| Data models | 70% | 80% |
| Configuration | 50% | 70% |

### Running Coverage
```bash
# Full coverage report
npx vitest run --coverage

# Coverage for a specific directory
npx vitest run --coverage src/services/

# Open HTML coverage report
npx vitest run --coverage && open coverage/index.html
```

## Test Organization

```
src/
  services/
    user.ts
    payment.ts
  utils/
    format.ts
tests/
  services/
    user.test.ts      # Unit tests for UserService
    payment.test.ts   # Unit tests for PaymentService
  integration/
    user-api.test.ts  # Integration tests for user API routes
  utils/
    format.test.ts
  fixtures/
    users.ts          # Test data factories
    mockDb.ts         # Shared database mock
e2e/
  login.spec.ts       # Playwright E2E tests
  checkout.spec.ts
```

## Mocking Strategies

### Function Mocks
```typescript
const mockSendEmail = vi.fn()
vi.mock('../src/services/email.js', () => ({
  EmailService: vi.fn(() => ({ send: mockSendEmail })),
}))
```

### Time Mocks
```typescript
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-30T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

### Database Mocks
```typescript
// Use a factory function for consistent test data
function createTestUser(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    ...overrides,
  }
}
```

## What to Test

Always test:
- Happy path (valid inputs, expected outputs)
- Edge cases (empty strings, zero, null, undefined, very large numbers)
- Error handling (invalid inputs, network failures, permission denied)
- Boundary conditions (off-by-one, max length, min value)
- Side effects (was the database called? was the event emitted?)
- Idempotency (calling twice produces the same result)

## What NOT to Test

- Third-party library internals (trust their tests)
- Language features (don't test that `Array.map` works)
- Trivial getters and setters with no logic
- UI pixel-perfect rendering (use visual regression tools instead)
