import { describe, it, expect } from "vitest";
import {
  normalizeReg,
  isValidReg,
  normalizeVin,
  isValidVin,
  maskReg,
  maskVin,
  isValidEmail,
  passwordProblem,
} from "../lib/server/validate";

describe("Registration number validation", () => {
  it("normalises spacing and dashes to uppercase", () => {
    expect(normalizeReg("MH 01 ab-1234")).toBe("MH01AB1234");
  });
  it("accepts a well-formed Indian registration", () => {
    expect(isValidReg("MH01AB1234")).toBe(true);
    expect(isValidReg("KA 05 1234")).toBe(false); // too few chars in series
    expect(isValidReg("XX99ZZ9999")).toBe(true);
  });
  it("rejects gibberish", () => {
    expect(isValidReg("hello")).toBe(false);
  });
});

describe("VIN validation", () => {
  it("normalises and validates a 17-char VIN", () => {
    const vin = normalizeVin("1hg cm82633a123456");
    expect(vin).toBe("1HGCM82633A123456");
    expect(isValidVin(vin)).toBe(true);
  });
  it("rejects VINs containing I, O or Q and wrong length", () => {
    expect(isValidVin("1HGCM82633A12345I")).toBe(false); // contains I + short
    expect(isValidVin("ABCDEFGHIJKLMNOPQ")).toBe(false); // contains I/O/Q
    expect(isValidVin("TOOSHORT")).toBe(false);
  });
});

describe("Sensitive-value masking", () => {
  it("masks registrations but keeps edges", () => {
    expect(maskReg("MH01AB1234")).toBe("MH01••••34");
  });
  it("masks VINs but keeps edges", () => {
    expect(maskVin("1HGCM82633A123456")).toBe("1HGCM••••••••456");
  });
});

describe("Email + password policy", () => {
  it("validates email format", () => {
    expect(isValidEmail("owner@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
  it("enforces password length and character mix", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("allletters")).not.toBeNull();
    expect(passwordProblem("1234567890")).not.toBeNull();
    expect(passwordProblem("goodPass123")).toBeNull();
  });
});
