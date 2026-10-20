import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function fmtNum(n: number) {
  return n.toLocaleString("pt-BR");
}

export function maskSecret(value: string | undefined | null, keep = 6) {
  if (!value) return "";
  if (value.length <= keep) return "•".repeat(value.length);
  return "•".repeat(Math.max(8, value.length - keep)) + value.slice(-keep);
}

export function isRobloxUser(name: string) {
  return /^[A-Za-z0-9_]{3,20}$/.test(name.trim());
}
