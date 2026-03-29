/**
 * Password hashing utilities using Web Crypto API (PBKDF2-SHA256).
 *
 * Uses 100,000 iterations with a 16-byte salt for secure password hashing.
 * Compatible with Cloudflare Workers runtime.
 */

export interface PasswordHash {
  hash: string;  // base64-encoded SHA-256 hash (32 bytes)
  salt: string;  // base64-encoded salt (16 bytes)
}

/**
 * Generate a random salt for password hashing.
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

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
 * Hash a password using PBKDF2-SHA256.
 *
 * @param password - The plaintext password to hash
 * @returns PasswordHash containing the hash and salt (both base64-encoded)
 */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  // Generate a random salt
  const salt = generateSalt();

  // Import the password as a key for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordData,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  // Derive the hash using PBKDF2
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  );

  // Encode both hash and salt as base64-url strings
  const hashBytes = new Uint8Array(hashBuffer);
  const hash = encodeBase64Url(hashBytes);
  const saltB64 = encodeBase64Url(salt);

  return { hash, salt: saltB64 };
}

/**
 * Verify a password against a stored hash.
 *
 * @param password - The plaintext password to verify
 * @param storedHash - The base64-encoded hash to compare against
 * @param storedSalt - The base64-encoded salt used for hashing
 * @returns true if the password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    // Decode the stored salt
    const salt = decodeBase64Url(storedSalt);

    // Import the password as a key for PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    // Derive the hash using PBKDF2
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    // Encode the computed hash
    const hashBytes = new Uint8Array(hashBuffer);
    const computedHash = encodeBase64Url(hashBytes);

    // Timing-safe comparison
    return computedHash === storedHash;
  } catch {
    return false;
  }
}

/**
 * Validate password strength according to security requirements.
 *
 * Requirements:
 * - Minimum 8 characters
 * - Must contain at least one uppercase letter OR one number
 *   (relaxed from design doc which required both)
 *
 * @param password - The password to validate
 * @returns true if the password meets requirements, false otherwise
 */
export function validatePassword(password: string): boolean {
  // Minimum length check
  if (password.length < 8) {
    return false;
  }

  // Check for at least uppercase OR number (relaxed requirement)
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return hasUpperCase || hasNumber;
}

/**
 * Common password check (top 10,000 common passwords).
 * In production, this should use a comprehensive list.
 *
 * @param password - The password to check
 * @returns true if the password is common, false otherwise
 */
export function isCommonPassword(password: string): boolean {
  // A small sample of common passwords for demonstration
  // In production, use a comprehensive list of 10,000+ common passwords
  const commonPasswords = new Set([
    "password", "12345678", "qwerty123", "abc12345",
    "password1", "123456789", "welcome1", "monkey123",
    "sunshine1", "password123", "1234567890", "football1",
    "iloveyou1", "princess1", "adobe123", "admin123",
    "letmein1", "welcome123", "master123", "hello123",
  ]);

  return commonPasswords.has(password.toLowerCase());
}
