/**
 * Rate limiting for authentication endpoints.
 *
 * Tracks sign-in attempts per email and per IP using KV storage.
 * Locks out after 5 failed attempts per 15 minutes.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

// Rate limit configurations
const SIGN_IN_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const SIGN_UP_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
};

const IP_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * Generate KV key for rate limiting.
 */
function rateLimitKey(prefix: string, identifier: string): string {
  return `ratelimit:${prefix}:${identifier}`;
}

/**
 * Check rate limit using KV storage.
 *
 * @param kv - KV namespace from env
 * @param key - KV key for the rate limit counter
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if request is allowed
 */
async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();

  // Get current count
  const currentData = await kv.get(key, "json");
  const current =
    currentData && typeof currentData === "object" && "count" in currentData
      ? (currentData as { count: number; resetAt: number })
      : null;

  // Check if window has expired
  if (current && current.resetAt < now) {
    // Window expired, reset counter
    await kv.put(
      key,
      JSON.stringify({ count: 1, resetAt: now + config.windowMs }),
      { expirationTtl: Math.ceil(config.windowMs / 1000) }
    );

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Check if limit exceeded
  if (current && current.count >= config.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  // Increment counter
  const newCount = (current?.count ?? 0) + 1;
  const resetAt = current?.resetAt ?? now + config.windowMs;

  await kv.put(
    key,
    JSON.stringify({ count: newCount, resetAt }),
    { expirationTtl: Math.ceil(config.windowMs / 1000) }
  );

  return {
    allowed: true,
    remaining: config.maxAttempts - newCount,
    resetAt,
  };
}

/**
 * Check sign-in rate limit for an email.
 *
 * @param kv - KV namespace from env
 * @param email - User email address
 * @returns RateLimitResult indicating if sign-in is allowed
 */
export async function checkSignInRateLimit(
  kv: KVNamespace,
  email: string
): Promise<RateLimitResult> {
  const key = rateLimitKey("signin", email.toLowerCase());
  return checkRateLimit(kv, key, SIGN_IN_RATE_LIMIT);
}

/**
 * Check sign-up rate limit for an IP.
 *
 * @param kv - KV namespace from env
 * @param ip - Client IP address
 * @returns RateLimitResult indicating if sign-up is allowed
 */
export async function checkSignUpRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<RateLimitResult> {
  const key = rateLimitKey("signup", ip);
  return checkRateLimit(kv, key, SIGN_UP_RATE_LIMIT);
}

/**
 * Check IP rate limit for auth endpoints.
 *
 * @param kv - KV namespace from env
 * @param ip - Client IP address
 * @returns RateLimitResult indicating if request is allowed
 */
export async function checkIpRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<RateLimitResult> {
  const key = rateLimitKey("ip", ip);
  return checkRateLimit(kv, key, IP_RATE_LIMIT);
}

/**
 * Record a failed sign-in attempt for rate limiting.
 *
 * @param kv - KV namespace from env
 * @param email - User email address
 * @returns Updated rate limit status
 */
export async function recordFailedSignIn(
  kv: KVNamespace,
  email: string
): Promise<RateLimitResult> {
  return checkSignInRateLimit(kv, email);
}

/**
 * Reset rate limit counter (e.g., after successful sign-in).
 *
 * @param kv - KV namespace from env
 * @param email - User email address
 */
export async function resetSignInRateLimit(
  kv: KVNamespace,
  email: string
): Promise<void> {
  const key = rateLimitKey("signin", email.toLowerCase());
  await kv.delete(key);
}

/**
 * Get rate limit headers for HTTP response.
 *
 * @param result - RateLimitResult from checkRateLimit
 * @returns Headers object with rate limit info
 */
export function getRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers({
    "X-RateLimit-Limit": "5",
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetAt.toString(),
  });

  if (!result.allowed) {
    headers.set("Retry-After", Math.ceil((result.resetAt - Date.now()) / 1000).toString());
  }

  return headers;
}

/**
 * Get client IP address from request headers.
 * Checks X-Forwarded-For, CF-Connecting-IP, then falls back to remote address.
 *
 * @param request - The HTTP request
 * @returns Client IP address
 */
export function getClientIp(request: Request): string {
  // Check CF-Connecting-IP header (Cloudflare)
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) {
    return cfIp;
  }

  // Check X-Forwarded-For header
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) {
    // Take the first IP (original client)
    const ips = xff.split(",").map((ip) => ip.trim());
    if (ips[0]) {
      return ips[0];
    }
  }

  // Fallback (in Workers, this might not be available)
  return "unknown";
}
