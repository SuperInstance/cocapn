/**
 * Authentication HTTP routes.
 *
 * Handles signup, signin, refresh, logout, and API key endpoints.
 * Includes CORS, rate limiting, and error handling.
 */

import type {
  SignUpRequest,
  SignInRequest,
  RefreshTokenRequest,
  CreateApiKeyRequest,
  ErrorResponse,
} from "./types.js";
import {
  createUser,
  authenticate,
  verifyToken,
  refreshToken,
  revokeRefreshToken,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
  ERRORS,
} from "./service.js";
import { checkSignInRateLimit, checkSignUpRateLimit, getClientIp, getRateLimitHeaders } from "./rate-limit.js";
import { extractBearerToken, getUserFromRequest } from "./tokens.js";

/**
 * Handle POST /api/auth/signup
 *
 * Create a new user account.
 */
export async function handleSignup(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    AUTH_KV: KVNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const body = (await request.json()) as SignUpRequest;

    if (!body.email || !body.password || !body.name) {
      return errorResponse("Missing required fields: email, password, name", 400);
    }

    // Check rate limits
    const ip = getClientIp(request);
    const rateLimitResult = await checkSignUpRateLimit(env.AUTH_KV, ip);

    if (!rateLimitResult.allowed) {
      const headers = getRateLimitHeaders(rateLimitResult);
      headers.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          error: ERRORS.RATE_LIMIT_EXCEEDED,
          message: "Too many sign-up attempts. Please try again later.",
          timestamp: new Date().toISOString(),
        } as ErrorResponse),
        { status: 429, headers }
      );
    }

    // Create user
    const result = await createUser(
      env,
      body.email,
      body.password,
      body.name,
      body.instance,
      body.plan
    );

    return jsonResponse(result, 201);
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle POST /api/auth/signin
 *
 * Authenticate a user with email and password.
 */
export async function handleSignin(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    AUTH_KV: KVNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const body = (await request.json()) as SignInRequest;

    if (!body.email || !body.password) {
      return errorResponse("Missing required fields: email, password", 400);
    }

    const ip = getClientIp(request);

    // Check rate limits (per email and per IP)
    const [emailRateLimit, ipRateLimit] = await Promise.all([
      checkSignInRateLimit(env.AUTH_KV, body.email),
      checkSignUpRateLimit(env.AUTH_KV, ip), // Reuse sign-up limit for IP
    ]);

    if (!emailRateLimit.allowed || !ipRateLimit.allowed) {
      const headers = getRateLimitHeaders(emailRateLimit);
      headers.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          error: ERRORS.RATE_LIMIT_EXCEEDED,
          message: "Too many sign-in attempts. Please try again later.",
          timestamp: new Date().toISOString(),
        } as ErrorResponse),
        { status: 429, headers }
      );
    }

    // Authenticate
    const result = await authenticate(env, body.email, body.password, ip);

    // Reset rate limit on successful login
    await env.AUTH_KV.delete(`ratelimit:signin:${body.email.toLowerCase()}`);

    return jsonResponse(result);
  } catch (err) {
    // Record failed attempt
    if (err instanceof Error && err.message === ERRORS.INVALID_CREDENTIALS) {
      try {
        const body = (await request.clone().json()) as SignInRequest;
        await checkSignInRateLimit(env.AUTH_KV, body.email);
      } catch {
        // Ignore rate limit errors
      }
    }
    return handleAuthError(err);
  }
}

/**
 * Handle POST /api/auth/refresh
 *
 * Refresh an access token using a refresh token.
 */
export async function handleRefresh(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    AUTH_KV: KVNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const body = (await request.json()) as RefreshTokenRequest;

    if (!body.refreshToken) {
      return errorResponse("Missing required field: refreshToken", 400);
    }

    const result = await refreshToken(env, body.refreshToken);

    return jsonResponse(result);
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle POST /api/auth/signout
 *
 * Revoke a refresh token (sign out).
 */
export async function handleSignout(
  request: Request,
  env: {
    AUTH_KV: KVNamespace;
  }
): Promise<Response> {
  try {
    const body = (await request.json()) as RefreshTokenRequest;

    if (!body.refreshToken) {
      return errorResponse("Missing required field: refreshToken", 400);
    }

    await revokeRefreshToken(env, body.refreshToken);

    return jsonResponse({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle GET /api/auth/me
 *
 * Get the current authenticated user.
 */
export async function handleGetMe(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env.FLEET_JWT_SECRET);

    // Fetch full user data
    const userResponse = await verifyToken(env, extractBearerToken(request)!);

    return jsonResponse(userResponse);
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle POST /api/auth/api-keys
 *
 * Generate a new API key for the authenticated user.
 */
export async function handleCreateApiKey(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env.FLEET_JWT_SECRET);
    const body = (await request.json()) as CreateApiKeyRequest;

    if (!body.name) {
      return errorResponse("Missing required field: name", 400);
    }

    const result = await createApiKey(env, user.sub, body);

    return jsonResponse(result, 201);
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle GET /api/auth/api-keys
 *
 * List API keys for the authenticated user.
 */
export async function handleListApiKeys(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env.FLEET_JWT_SECRET);

    const result = await listApiKeys(env, user.sub);

    return jsonResponse(result);
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Handle DELETE /api/auth/api-keys/:id
 *
 * Revoke an API key.
 */
export async function handleRevokeApiKey(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env.FLEET_JWT_SECRET);

    const url = new URL(request.url);
    const keyId = url.pathname.split("/").pop();

    if (!keyId) {
      return errorResponse("Missing API key ID", 400);
    }

    await revokeApiKey(env, user.sub, keyId);

    return jsonResponse({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Auth middleware — verify JWT or API key and attach user to context.
 *
 * Returns the user if authenticated, throws error otherwise.
 */
export async function authMiddleware(
  request: Request,
  env: {
    ADMIRAL: DurableObjectNamespace;
    FLEET_JWT_SECRET: string;
  }
): Promise<{ user: { id: string; email: string; name: string; plan: string }; type: "jwt" | "api_key" }> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    throw new Error(ERRORS.MISSING_TOKEN);
  }

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Check if it's an API key
    if (token.startsWith("cocapn_sk_")) {
      const user = await verifyApiKey(env, token);
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
        },
        type: "api_key",
      };
    }

    // Otherwise, treat as JWT
    const payload = await verifyAccessToken(token, env.FLEET_JWT_SECRET);
    return {
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        plan: payload.plan,
      },
      type: "jwt",
    };
  }

  throw new Error(ERRORS.MISSING_TOKEN);
}

/**
 * Handle authentication errors and return appropriate HTTP responses.
 */
function handleAuthError(err: unknown): Response {
  if (err instanceof Error) {
    const errorMap: Record<string, { status: number; message: string }> = {
      [ERRORS.INVALID_CREDENTIALS]: { status: 401, message: "Invalid email or password" },
      [ERRORS.USER_EXISTS]: { status: 409, message: "Email already registered" },
      [ERRORS.USER_NOT_FOUND]: { status: 404, message: "User not found" },
      [ERRORS.TOKEN_EXPIRED]: { status: 401, message: "Token expired" },
      [ERRORS.TOKEN_REVOKED]: { status: 401, message: "Token revoked" },
      [ERRORS.ACCOUNT_SUSPENDED]: { status: 403, message: "Account suspended" },
      [ERRORS.ACCOUNT_BANNED]: { status: 403, message: "Account permanently banned" },
      [ERRORS.INVALID_TOKEN]: { status: 401, message: "Invalid token" },
      [ERRORS.MISSING_TOKEN]: { status: 401, message: "Missing authorization header" },
      [ERRORS.WEAK_PASSWORD]: { status: 400, message: "Password does not meet requirements" },
      [ERRORS.COMMON_PASSWORD]: { status: 400, message: "Password is too common" },
      [ERRORS.INVALID_EMAIL]: { status: 400, message: "Invalid email format" },
      [ERRORS.INVALID_INSTANCE]: { status: 400, message: "Instance name must be 3-20 alphanumeric characters" },
    };

    const errorInfo = errorMap[err.message];
    if (errorInfo) {
      return errorResponse(errorInfo.message, errorInfo.status);
    }
  }

  return errorResponse("Internal server error", 500);
}

/**
 * Create a JSON response with CORS headers.
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Create an error response.
 */
function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: message,
      timestamp: new Date().toISOString(),
    } as ErrorResponse),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
