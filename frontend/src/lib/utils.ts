import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind class merging utility: use `clsx` first to handle conditional class names,
 * then `tailwind-merge` to dedupe/resolve conflicting classes.
 * Usage: cn("p-2", isActive && "bg-primary", "p-3") // => "bg-primary p-3"
 */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
