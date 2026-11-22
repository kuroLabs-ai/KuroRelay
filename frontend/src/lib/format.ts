import { formatDistanceToNow } from "date-fns";

/**
 * Format a latency value in milliseconds to a human-readable string.
 * Values >= 1000ms are shown in seconds with 2 decimal places.
 */
export function formatLatency(ms: number): string {
  const rounded = Math.round(ms || 0);
  if (rounded >= 1000) {
    return `${(rounded / 1000).toFixed(2)}s`;
  }
  return `${rounded}ms`;
}

/**
 * Parse a date value that may be a naive UTC ISO string (no timezone suffix).
 * Appends 'Z' if no timezone info is present so JS parses it as UTC.
 */
export function parseUtcDate(value: string | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  let str = String(value).trim();
  if (!str) return new Date();
  // If string has no timezone suffix (no Z and no +/- offset), treat as UTC
  if (!str.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    if (str.includes("T")) {
      str = `${str}Z`;
    } else if (str.includes(" ")) {
      str = `${str.replace(" ", "T")}Z`;
    } else {
      str = `${str}Z`;
    }
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Format a date as a human-readable relative time string.
 * Shows "just now" for timestamps within the last 45 seconds.
 */
export function formatRelativeTime(dateInput: string | Date): string {
  try {
    const d = parseUtcDate(dateInput);
    const diffMs = Date.now() - d.getTime();
    // If it occurred within the last 45 seconds or slight clock skew
    if (diffMs >= -15000 && diffMs < 45000) {
      return "just now";
    }
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return String(dateInput);
  }
}
