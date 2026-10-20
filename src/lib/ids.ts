import { randomBytes } from "node:crypto";

export function rid(bytes = 5) {
  return randomBytes(bytes).toString("hex").toUpperCase();
}

export function orderId() {
  return `RBX-${rid(8)}`;
}

export function ticketPublicId() {
  return `TCK-${rid(4)}`;
}

export function ticketSecret() {
  return rid(12);
}
