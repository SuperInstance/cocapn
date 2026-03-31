# Design Patterns Reference

This document catalogs the design patterns commonly used and recommended in this project. Patterns are organized by category with practical examples in TypeScript.

## Creational Patterns

### Singleton
Use when exactly one instance of a class is needed across the application. Common for configuration managers, connection pools, and logger instances.

```typescript
class ConfigManager {
  private static instance: ConfigManager | null = null
  private config: Record<string, unknown>

  private constructor() {
    this.config = this.loadConfig()
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  private loadConfig(): Record<string, unknown> {
    return {}
  }
}
```

**When to use:** Configuration, logging, database connection pools.
**When to avoid:** When you need testability — prefer dependency injection instead.

### Factory Method
Delegates object creation to subclasses or dedicated factory functions. Useful when the exact type to instantiate depends on runtime conditions.

```typescript
interface Notification {
  send(message: string): Promise<void>
}

class EmailNotification implements Notification {
  async send(message: string): Promise<void> { /* ... */ }
}

class SlackNotification implements Notification {
  async send(message: string): Promise<void> { /* ... */ }
}

function createNotification(channel: 'email' | 'slack'): Notification {
  switch (channel) {
    case 'email': return new EmailNotification()
    case 'slack': return new SlackNotification()
  }
}
```

### Builder
Constructs complex objects step by step. Ideal when an object has many optional parameters or configuration options.

```typescript
class QueryBuilder {
  private table = ''
  private conditions: string[] = []
  private orderField = ''
  private limitValue = 0

  from(table: string): this {
    this.table = table
    return this
  }

  where(condition: string): this {
    this.conditions.push(condition)
    return this
  }

  orderBy(field: string): this {
    this.orderField = field
    return this
  }

  limit(count: number): this {
    this.limitValue = count
    return this
  }

  build(): string {
    let query = `SELECT * FROM ${this.table}`
    if (this.conditions.length > 0) {
      query += ` WHERE ${this.conditions.join(' AND ')}`
    }
    if (this.orderField) query += ` ORDER BY ${this.orderField}`
    if (this.limitValue) query += ` LIMIT ${this.limitValue}`
    return query
  }
}
```

## Structural Patterns

### Adapter
Converts the interface of a class into another interface that clients expect. Essential for integrating third-party libraries or legacy code.

```typescript
interface ILogger {
  log(level: string, message: string): void
}

class ThirdPartyLogger {
  info(msg: string): void { /* ... */ }
  error(msg: string): void { /* ... */ }
}

class LoggerAdapter implements ILogger {
  constructor(private adaptee: ThirdPartyLogger) {}

  log(level: string, message: string): void {
    if (level === 'error') this.adaptee.error(message)
    else this.adaptee.info(message)
  }
}
```

### Decorator
Adds behavior to objects dynamically without altering their structure. Useful for adding cross-cutting concerns like logging, caching, or validation.

```typescript
interface DataSource {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
}

class CachingDecorator implements DataSource {
  private cache = new Map<string, string>()

  constructor(private wrapped: DataSource) {}

  async read(key: string): Promise<string | null> {
    if (this.cache.has(key)) return this.cache.get(key)!
    const value = await this.wrapped.read(key)
    if (value) this.cache.set(key, value)
    return value
  }

  async write(key: string, value: string): Promise<void> {
    this.cache.set(key, value)
    await this.wrapped.write(key, value)
  }
}
```

### Facade
Provides a simplified interface to a complex subsystem. Reduces coupling between clients and subsystems.

## Behavioral Patterns

### Observer
Defines a one-to-many dependency so that when one object changes state, all dependents are notified. Used for event systems and reactive programming.

```typescript
type EventCallback = (data: unknown) => void

class EventBus {
  private listeners = new Map<string, Set<EventCallback>>()

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    return () => this.listeners.get(event)?.delete(callback)
  }

  emit(event: string, data?: unknown): void {
    this.listeners.get(event)?.forEach(cb => cb(data))
  }
}
```

### Strategy
Defines a family of algorithms, encapsulates each one, and makes them interchangeable. Lets the algorithm vary independently from the clients that use it.

### Command
Encapsulates a request as an object, thereby allowing parameterization, queuing, and undo operations.

## Principles to Keep in Mind

- **SOLID** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY** — Don't Repeat Yourself. Extract shared logic before the third duplication.
- **KISS** — Keep It Simple. Prefer a straightforward solution over a clever one.
- **YAGNI** — You Aren't Gonna Need It. Don't build abstractions until you have concrete use cases.
- **Composition over Inheritance** — Prefer composing small, focused objects over deep class hierarchies.
