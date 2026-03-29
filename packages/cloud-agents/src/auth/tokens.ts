/**
 * JWT token management for user authentication.
 *
 * Implements JWT generation and verification using HS256 (HMAC-SHA256).
 * Access tokens expire in 15 minutes; refresh tokens use UUIDs stored in KV.
 */

export interface JwtPayload {
  sub: string;          // User ID
  email: string;        // User email
  name: string;         // User display name
  instance?: string;    // User instance (subdomain)
  plan: string;         // User plan: 'free' | 'pro'
  iat: number;          // Issued at (Unix timestamp)
  exp: number;          // Expiration (Unix timestamp)
  iss: string;          // Issuer: "cocapn.ai"
  aud: string;          // Audience: "cocapn-workers"
}

export interface AuthTokens {
  accessToken: string;   // JWT, 15 minutes
  refreshToken: string;  // UUID v4, stored in KV (30 days in production)
  expiresIn: number;     // Seconds until expiration (900)
}

export interface RefreshTokenData {
  userId: string;
  createdAt: string;
  userAgent?: string;
  ip?: string;
}

// Token expiration times
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY_DAYS = 30; // 30 days (TTL in KV)

/**
 * Encode a byte array to base64-url string (no padding).
 */
function encodeBase64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b));
  const b64 = btoa(bin.join(""));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode a base64-url string to a byte array.
 */
function decodeBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Convert a string to a Uint8Array.
 */
function stringToBytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Sign data using HMAC-SHA256.
 */
async function signHmacSha256(data: string, secret: string): Promise<string> {
  const keyData = stringToBytes(secret);
  const messageData = stringToBytes(data);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return encodeBase64Url(new Uint8Array(signature));
}

/**
 * Verify HMAC-SHA256 signature.
 */
async function verifyHmacSha256(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expectedSignature = await signHmacSha256(data, secret);

  // Timing-safe comparison
  const sigBytes = decodeBase64Url(signature);
  const expectedBytes = decodeBase64Url(expectedSignature);

  if (sigBytes.length !== expectedBytes.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < sigBytes.length; i++) {
    result |= sigBytes[i]! ^ expectedBytes[i]!;
  }

  return result === 0;
}

/**
 * Generate an access token JWT for a user.
 *
 * @param user - User object containing id, email, name, instance, plan
 * @param secret - JWT secret for signing (from env.USER_JWT_SECRET or env.FLEET_JWT_SECRET)
 * @returns Signed JWT access token
 */
export async function generateAccessToken(
  user: {
    id: string;
    email: string;
    name: string;
    instance?: string;
    plan: string;
  },
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_EXPIRY;

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    instance: user.instance,
    plan: user.plan,
    iat: now,
    exp,
    iss: "cocapn.ai",
    aud: "cocapn-workers",
  };

  const header = { alg: "HS256", typ: "JWT" };

  // Encode header and payload
  const headerB64 = encodeBase64Url(stringToBytes(JSON.stringify(header)));
  const payloadB64 = encodeBase64Url(stringToBytes(JSON.stringify(payload)));

  // Create signature
  const data = `${headerB64}.${payloadB64}`;
  const signature = await signHmacSha256(data, secret);

  return `${data}.${signature}`;
}

/**
 * Generate a refresh token UUID and return both tokens.
 *
 * @param user - User object containing id, email, name, instance, plan
 * @param secret - JWT secret for signing
 * @returns AuthTokens containing both access and refresh tokens
 */
export async function generateTokenPair(
  user: {
    id: string;
    email: string;
    name: string;
    instance?: string;
    plan: string;
  },
  secret: string
): Promise<AuthTokens> {
  const accessToken = await generateAccessToken(user, secret);
  const refreshToken = crypto.randomUUID();

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Verify and decode a JWT access token.
 *
 * @param token - The JWT token to verify
 * @param secret - JWT secret for verification
 * @returns Decoded JWT payload if valid
 * @throws Error if token is invalid or expired
 */
export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_token_format");
  }

  const [headerB64, payloadB64, signature] = parts as [
    string,
    string,
    string
  ];

  // Verify signature
  const data = `${headerB64}.${payloadB64}`;
  const isValid = await verifyHmacSha256(data, signature, secret);

  if (!isValid) {
    throw new Error("invalid_signature");
  }

  // Decode payload
  try {
    const payloadBytes = decodeBase64Url(payloadB64);
    const payloadStr = Array.from(payloadBytes, (b) =>
      String.fromCharCode(b)
    ).join("");
    const payload = JSON.parse(payloadStr) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error("token_expired");
    }

    return payload;
  } catch (err) {
    if (err instanceof Error && err.message === "token_expired") {
      throw err;
    }
    throw new Error("invalid_payload");
  }
}

/**
 * Extract the Authorization Bearer token from a request.
 *
 * @param request - The HTTP request
 * @returns The bearer token or undefined if not present
 */
export function extractBearerToken(request: Request): string | undefined {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return undefined;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return undefined;
  }

  return authHeader.slice(7);
}

/**
 * Extract user from JWT token in Authorization header.
 * Convenience wrapper that combines extractBearerToken and verifyAccessToken.
 *
 * @param request - The HTTP request
 * @param secret - JWT secret for verification
 * @returns Decoded JWT payload if valid
 * @throws Error if token is missing, invalid, or expired
 */
export async function getUserFromRequest(
  request: Request,
  secret: string
): Promise<JwtPayload> {
  const token = extractBearerToken(request);

  if (!token) {
    throw new Error("missing_token");
  }

  return verifyAccessToken(token, secret);
}
