/**
 * Authentication types and interfaces.
 */

export interface User {
  id: string;              // UUID v4
  email: string;           // lowercase, unique
  passwordHash: string;    // PBKDF2-SHA256, base64
  passwordSalt: string;    // 16 bytes, base64
  name: string;            // Display name
  instance?: string;       // Custom subdomain (optional)
  plan: "free" | "pro";
  createdAt: string;       // ISO timestamp
  lastLogin?: string;      // ISO timestamp
  lastLoginIp?: string;    // For security monitoring
  settings?: Record<string, unknown>;
  status: "active" | "suspended" | "banned";
  metadata?: Record<string, unknown>;
}

export type UserResponse = Omit<User, "passwordHash" | "passwordSalt">;

export interface AuthTokens {
  accessToken: string;     // JWT, 15 min
  refreshToken: string;    // UUID v4
  expiresIn: number;       // Seconds
}

export interface AuthResponse {
  user: UserResponse;
  tokens: AuthTokens;
}

export interface RefreshTokenData {
  userId: string;
  createdAt: string;
  userAgent?: string;
  ip?: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes?: string[];
  expiresIn?: number; // Days until expiration
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // Show only on creation
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  name: string;
  instance?: string;
  plan?: "free" | "pro";
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  timestamp: string;
}
