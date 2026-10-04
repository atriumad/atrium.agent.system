import clsx, { type ClassValue } from "clsx";

/** Joins class names. Components append the caller's `className` last. */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export type { ClassValue };
