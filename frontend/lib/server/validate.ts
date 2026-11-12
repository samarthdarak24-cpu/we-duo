// ---------------------------------------------------------------------------
// Input validation helpers (design.md §9.3, §4.3 S3). Indian registration
// format after normalisation, and a 17-character VIN with no I/O/Q.
// ---------------------------------------------------------------------------

export function normalizeReg(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidReg(value: string): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4}$/.test(normalizeReg(value));
}

export function normalizeVin(value: string): string | null {
  const v = (value ?? "").toUpperCase().replace(/[\s-]/g, "");
  return v ? v : null;
}

export function isValidVin(value: string | null | undefined): boolean {
  if (!value) return false;
  const vin = normalizeVin(value);
  return vin ? /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) : false;
}

export function maskReg(reg: string): string {
  const r = normalizeReg(reg);
  if (r.length < 6) return r;
  return `${r.slice(0, 4)}••••${r.slice(-2)}`;
}

export function maskVin(vin: string): string {
  if (vin.length < 8) return vin;
  return `${vin.slice(0, 5)}••••••••${vin.slice(-3)}`;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordProblem(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return "Password must include a letter and a number.";
  return null;
}
