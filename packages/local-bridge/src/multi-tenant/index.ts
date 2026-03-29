/**
 * Multi-tenant brain isolation.
 *
 * Provides tenant-scoped brains, personalities, skills, and usage metering.
 */

export { TenantRegistry } from "./tenant-registry.js";
export { TenantBridge } from "./tenant-bridge.js";
export {
  createTenantMiddleware,
  sendTenantError,
  extractResolutionRequest,
  TenantError,
} from "./middleware.js";
export type { TenantMiddlewareResult } from "./middleware.js";
export type {
  Tenant,
  TenantConfig,
  TenantUsage,
  TenantContext,
  TenantStatus,
  TenantPlan,
  TenantResolutionRequest,
} from "./types.js";
export { PLAN_DEFAULTS } from "./types.js";
