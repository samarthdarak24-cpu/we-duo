import { clsx, type ClassValue } from "clsx";

/** Merge Tailwind classes safely. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
