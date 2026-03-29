/**
 * Authentication service — business logic for user authentication.
 *
 * Handles user creation, authentication, token management, and API keys.
 * Uses AdmiralDO (SQLite) for user storage and KV for refresh tokens.
 */

import type {
  User,
  UserResponse,
  AuthResponse,
  RefreshTokenData,
  ApiKey,
  ApiKeyResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ErrorResponse,
} from "./types.js";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  isCommonPassword,
} from "./password.js";
import { generateTokenPair, verifyAccessToken, type JwtPayload } from "./tokens.js";

// Error codes
export const ERRORS = {
  INVALID_CREDENTIALS: "invalid_credentials",
  USER_EXISTS: "user_exists",
  USER_NOT_FOUND: "user_not_found",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_REVOKED: "token_revoked",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  ACCOUNT_SUSPENDED: "account_suspended",
  ACCOUNT_BANNED: "account_banned",
  INVALID_TOKEN: "invalid_token",
  MISSING_TOKEN: "missing_token",
  WEAK_PASSWORD: "weak_password",
  COMMON_PASSWORD: "common_password",
  INVALID_EMAIL: "invalid_email",
  INVALID_INSTANCE: "invalid_instance",
} as const;

/**
 * Create a new user account.
 *
 * @param env - Worker environment with ADMIRAL DO and KV
 * @param email - User email
 * @param password - User password (will be hashed)
 * @param name - Display name
 * @param instance - Optional subdomain
 * @param plan - Plan tier (default: "free")
 * @returns AuthResponse with user and tokens
 * @throws Error with error code if validation fails or user exists
 */
export async function createUser(
  env: { ADMIRAL: DurableObjectNamespace; AUTH_KV: KVNamespace },
  email: string,
  password: string,
  name: string,
  instance?: string,
  plan: "free" | "pro" = "free"
): Promise<AuthResponse> {
  // Validate email format
  const emailLower = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailLower)) {
    throw new Error(ERRORS.INVALID_EMAIL);
  }

  // Validate instance name format
  if (instance) {
    const instanceRegex = /^[a-z0-9]{3,20}$/;
    if (!instanceRegex.test(instance)) {
      throw new Error(ERRORS.INVALID_INSTANCE);
    }
  }

  // Validate password strength
  if (!validatePassword(password)) {
    throw new Error(ERRORS.WEAK_PASSWORD);
  }

  // Check common password
  if (isCommonPassword(password)) {
    throw new Error(ERRORS.COMMON_PASSWORD);
  }

  // Hash password
  const { hash, salt } = await hashPassword(password);

  // Create user object
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  const user: User = {
    id: userId,
    email: emailLower,
    passwordHash: hash,
    passwordSalt: salt,
    name: name.trim(),
    instance,
    plan,
    createdAt: now,
    status: "active",
  };

  // Store user in AdmiralDO
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request("https://admiral.internal/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", user }),
    })
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes("UNIQUE constraint failed") || error.includes("already exists")) {
      throw new Error(ERRORS.USER_EXISTS);
    }
    throw new Error(`database_error: ${error}`);
  }

  // Generate tokens
  const tokens = await generateTokenPair(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      instance: user.instance,
      plan: user.plan,
    },
    env.FLEET_JWT_SECRET ?? "default-secret"
  );

  // Store refresh token in KV
  const refreshData: RefreshTokenData = {
    userId: user.id,
    createdAt: now,
  };
  await env.AUTH_KV.put(
    `refresh-token:${tokens.refreshToken}`,
    JSON.stringify(refreshData),
    { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
  );

  // Return response without password hash/salt
  const { passwordHash, passwordSalt, ...userResponse } = user;
  return { user: userResponse, tokens };
}

/**
 * Authenticate a user with email and password.
 *
 * @param env - Worker environment
 * @param email - User email
 * @param password - User password
 * @param ip - Optional client IP for security tracking
 * @returns AuthResponse with user and tokens
 * @throws Error with error code if credentials are invalid
 */
export async function authenticate(
  env: { ADMIRAL: DurableObjectNamespace; AUTH_KV: KVNamespace },
  email: string,
  password: string,
  ip?: string
): Promise<AuthResponse> {
  const emailLower = email.toLowerCase().trim();

  // Fetch user from AdmiralDO
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/users/by-email/${encodeURIComponent(emailLower)}`, {
      method: "GET",
    })
  );

  if (!response.ok) {
    throw new Error(ERRORS.INVALID_CREDENTIALS);
  }

  const user = (await response.json()) as User;

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!isValid) {
    throw new Error(ERRORS.INVALID_CREDENTIALS);
  }

  // Check account status
  if (user.status === "suspended") {
    throw new Error(ERRORS.ACCOUNT_SUSPENDED);
  }
  if (user.status === "banned") {
    throw new Error(ERRORS.ACCOUNT_BANNED);
  }

  // Update last login
  const now = new Date().toISOString();
  await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastLogin: now,
        lastLoginIp: ip,
      }),
    })
  );

  // Generate tokens
  const tokens = await generateTokenPair(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      instance: user.instance,
      plan: user.plan,
    },
    env.FLEET_JWT_SECRET ?? "default-secret"
  );

  // Store refresh token in KV
  const refreshData: RefreshTokenData = {
    userId: user.id,
    createdAt: now,
    ip,
  };
  await env.AUTH_KV.put(
    `refresh-token:${tokens.refreshToken}`,
    JSON.stringify(refreshData),
    { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
  );

  // Return response without password hash/salt
  const { passwordHash, passwordSalt, ...userResponse } = user;
  return { user: userResponse, tokens };
}

/**
 * Verify an access token and return the user.
 *
 * @param env - Worker environment
 * @param token - JWT access token
 * @returns User object
 * @throws Error with error code if token is invalid
 */
export async function verifyToken(
  env: { ADMIRAL: DurableObjectNamespace },
  token: string
): Promise<UserResponse> {
  // Verify JWT
  const payload = await verifyAccessToken(token, env.FLEET_JWT_SECRET ?? "default-secret");

  // Fetch user from database
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/users/${payload.sub}`, {
      method: "GET",
    })
  );

  if (!response.ok) {
    throw new Error(ERRORS.USER_NOT_FOUND);
  }

  const user = (await response.json()) as User;

  // Check account status
  if (user.status !== "active") {
    if (user.status === "suspended") {
      throw new Error(ERRORS.ACCOUNT_SUSPENDED);
    }
    if (user.status === "banned") {
      throw new Error(ERRORS.ACCOUNT_BANNED);
    }
  }

  // Return user without password
  const { passwordHash, passwordSalt, ...userResponse } = user;
  return userResponse;
}

/**
 * Refresh an access token using a refresh token.
 *
 * @param env - Worker environment
 * @param refreshToken - UUID refresh token
 * @returns New access token and expiry
 * @throws Error with error code if refresh token is invalid
 */
export async function refreshToken(
  env: { ADMIRAL: DurableObjectNamespace; AUTH_KV: KVNamespace },
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  // Look up refresh token in KV
  const tokenData = await env.AUTH_KV.get<RefreshTokenData>(
    `refresh-token:${refreshToken}`,
    "json"
  );

  if (!tokenData) {
    throw new Error(ERRORS.TOKEN_REVOKED);
  }

  // Fetch user
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/users/${tokenData.userId}`, {
      method: "GET",
    })
  );

  if (!response.ok) {
    throw new Error(ERRORS.USER_NOT_FOUND);
  }

  const user = (await response.json()) as User;

  // Check account status
  if (user.status !== "active") {
    if (user.status === "suspended") {
      throw new Error(ERRORS.ACCOUNT_SUSPENDED);
    }
    if (user.status === "banned") {
      throw new Error(ERRORS.ACCOUNT_BANNED);
    }
  }

  // Generate new access token
  const accessToken = await generateAccessToken(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      instance: user.instance,
      plan: user.plan,
    },
    env.FLEET_JWT_SECRET ?? "default-secret"
  );

  return {
    accessToken,
    expiresIn: 900, // 15 minutes
  };
}

/**
 * Revoke a refresh token (sign out).
 *
 * @param env - Worker environment
 * @param refreshToken - UUID refresh token to revoke
 */
export async function revokeRefreshToken(
  env: { AUTH_KV: KVNamespace },
  refreshToken: string
): Promise<void> {
  await env.AUTH_KV.delete(`refresh-token:${refreshToken}`);
}

/**
 * Create an API key for a user.
 *
 * @param env - Worker environment
 * @param userId - User ID
 * @param request - API key creation request
 * @returns API key response (key shown only on creation)
 */
export async function createApiKey(
  env: { ADMIRAL: DurableObjectNamespace },
  userId: string,
  request: CreateApiKeyRequest
): Promise<CreateApiKeyResponse> {
  const keyId = crypto.randomUUID();
  const secret = crypto.randomUUID();
  const key = `cocapn_sk_${secret}`;

  // Hash the key for storage (SHA-256)
  const keyBuffer = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBuffer);
  const hashBytes = new Uint8Array(hashBuffer);
  const keyHash = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Extract prefix for identification (first 8 chars after prefix)
  const keyPrefix = key.slice(10, 18);

  const now = new Date().toISOString();
  const expiresAt = request.expiresIn
    ? new Date(Date.now() + request.expiresIn * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  const apiKey: ApiKey = {
    id: keyId,
    userId,
    keyHash,
    keyPrefix,
    name: request.name,
    scopes: request.scopes ?? ["read", "write"],
    createdAt: now,
    expiresAt,
  };

  // Store in AdmiralDO
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request("https://admiral.internal/auth/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiKey),
    })
  );

  if (!response.ok) {
    throw new Error("database_error");
  }

  return {
    id: apiKey.id,
    name: apiKey.name,
    key, // Show only on creation
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
  };
}

/**
 * List API keys for a user.
 *
 * @param env - Worker environment
 * @param userId - User ID
 * @returns Array of API keys (without the actual key)
 */
export async function listApiKeys(
  env: { ADMIRAL: DurableObjectNamespace },
  userId: string
): Promise<ApiKeyResponse[]> {
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/api-keys/${userId}`, {
      method: "GET",
    })
  );

  if (!response.ok) {
    return [];
  }

  const apiKeys = (await response.json()) as ApiKey[];

  return apiKeys.map((key) => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    createdAt: key.createdAt,
    lastUsed: key.lastUsed,
    expiresAt: key.expiresAt,
  }));
}

/**
 * Revoke an API key.
 *
 * @param env - Worker environment
 * @param userId - User ID
 * @param keyId - API key ID to revoke
 */
export async function revokeApiKey(
  env: { ADMIRAL: DurableObjectNamespace },
  userId: string,
  keyId: string
): Promise<void> {
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/api-keys/${userId}/${keyId}`, {
      method: "DELETE",
    })
  );
}

/**
 * Verify an API key and return the associated user.
 *
 * @param env - Worker environment
 * @param apiKey - The API key (format: cocapn_sk_...)
 * @returns User object if API key is valid
 * @throws Error if API key is invalid
 */
export async function verifyApiKey(
  env: { ADMIRAL: DurableObjectNamespace },
  apiKey: string
): Promise<UserResponse> {
  if (!apiKey.startsWith("cocapn_sk_")) {
    throw new Error(ERRORS.INVALID_TOKEN);
  }

  // Hash the provided key
  const keyBuffer = new TextEncoder().encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBuffer);
  const hashBytes = new Uint8Array(hashBuffer);
  const keyHash = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Look up by hash in AdmiralDO
  const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("auth"));
  const response = await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/api-keys/verify/${keyHash}`, {
      method: "GET",
    })
  );

  if (!response.ok) {
    throw new Error(ERRORS.INVALID_TOKEN);
  }

  const apiKeyData = (await response.json()) as ApiKey & { user: User };

  // Check expiration
  if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
    throw new Error(ERRORS.TOKEN_EXPIRED);
  }

  // Update last used
  await admiralStub.fetch(
    new Request(`https://admiral.internal/auth/api-keys/${apiKeyData.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastUsed: new Date().toISOString() }),
    })
  );

  // Return user without password
  const { passwordHash, passwordSalt, ...userResponse } = apiKeyData.user;
  return userResponse;
}
