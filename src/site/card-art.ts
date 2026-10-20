/** Amounts that have real card art in /public/images/cards. (800 was removed from the store.) */
export const CARD_AMOUNTS = new Set([
  1200, 1700, 2100, 2500, 3600, 4500, 5000, 7000, 8000, 10000, 15000, 20000, 25000, 40000,
]);

export function hasCardArt(amount: number) {
  return CARD_AMOUNTS.has(amount);
}
