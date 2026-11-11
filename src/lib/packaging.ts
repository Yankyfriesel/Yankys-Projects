/** Whole grams: weights are kept to the gram, so sums never drift. */
export const grams = (kg: number): number => Math.round(kg * 1000);

/**
 * The weight to keep for a box: the scale reading less the packing, to the hundredth of a
 * kilogram. Null when nothing is left (or less than 0.01 kg).
 */
export function netWeight(grossKg: number, tareKg: number): number | null {
  const left = grams(grossKg) - grams(tareKg);
  const hundredths = Math.round(left / 10);
  return hundredths >= 1 ? hundredths / 100 : null;
}
