/**
 * Password hashing tests.
 */

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePassword, isCommonPassword } from "../src/auth/password.js";

describe("password hashing", () => {
  it("should hash a password", async () => {
    const { hash, salt } = await hashPassword("SecurePass123!");

    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
    expect(salt.length).toBeGreaterThan(0);
  });

  it("should verify a correct password", async () => {
    const password = "SecurePass123!";
    const { hash, salt } = await hashPassword(password);

    const isValid = await verifyPassword(password, hash, salt);

    expect(isValid).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const { hash, salt } = await hashPassword("SecurePass123!");

    const isValid = await verifyPassword("WrongPassword", hash, salt);

    expect(isValid).toBe(false);
  });

  it("should generate different salts for each hash", async () => {
    const { salt: salt1 } = await hashPassword("password");
    const { salt: salt2 } = await hashPassword("password");

    expect(salt1).not.toBe(salt2);
  });

  it("should generate different hashes for the same password", async () => {
    const password = "SecurePass123!";
    const { hash: hash1 } = await hashPassword(password);
    const { hash: hash2 } = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it("should handle invalid base64 gracefully", async () => {
    const isValid = await verifyPassword("password", "invalid-hash", "invalid-salt");

    expect(isValid).toBe(false);
  });
});

describe("password validation", () => {
  it("should accept a strong password", () => {
    expect(validatePassword("SecurePass123")).toBe(true);
  });

  it("should accept password with uppercase only", () => {
    expect(validatePassword("SecurePass")).toBe(true);
  });

  it("should accept password with number only", () => {
    expect(validatePassword("secure1234")).toBe(true);
  });

  it("should reject passwords shorter than 8 characters", () => {
    expect(validatePassword("Pass1")).toBe(false);
    expect(validatePassword("1234567")).toBe(false);
  });

  it("should reject lowercase-only passwords", () => {
    expect(validatePassword("password")).toBe(false);
    expect(validatePassword("nocaps123")).toBe(false);
  });

  it("should reject number-only passwords", () => {
    expect(validatePassword("12345678")).toBe(false);
  });
});

describe("common password detection", () => {
  it("should detect common passwords", () => {
    expect(isCommonPassword("password")).toBe(true);
    expect(isCommonPassword("12345678")).toBe(true);
    expect(isCommonPassword("qwerty123")).toBe(true);
  });

  it("should not flag strong passwords as common", () => {
    expect(isCommonPassword("MySecurePass123!")).toBe(false);
    expect(isCommonPassword("CorrectHorseBatteryStaple")).toBe(false);
  });

  it("should be case-insensitive for common passwords", () => {
    expect(isCommonPassword("PASSWORD")).toBe(true);
    expect(isCommonPassword("Password123")).toBe(true);
  });
});
