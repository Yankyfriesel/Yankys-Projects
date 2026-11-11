import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, checkPasswordStrength } from "./password";

describe("password hashing", () => {
  it("verifies the password it hashed and rejects others", async () => {
    const hash = await hashPassword("Temp-1234");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword(hash, "Temp-1234")).toBe(true);
    expect(await verifyPassword(hash, "temp-1234")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes without throwing", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
    expect(await verifyPassword("", "x")).toBe(false);
  });
});

describe("password strength", () => {
  it("accepts a long mixed password", () => {
    expect(checkPasswordStrength("Blue-Tiger-Jumps-42")).toBeNull();
  });
  it("refuses short, plain, common and repeated passwords", () => {
    expect(checkPasswordStrength("Ab1-xyz")).toBe("tooShort");
    expect(checkPasswordStrength("alllowercaseletters")).toBe("weak");
    expect(checkPasswordStrength("1234567890123456")).toBe("weak");
    expect(checkPasswordStrength("Password-12345-Ok")).toBe("weak");
    expect(checkPasswordStrength("aaaaaaaaaaaaaaaa")).toBe("weak");
  });
});
