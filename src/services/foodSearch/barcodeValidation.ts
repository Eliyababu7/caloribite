// Match the deployed food-search GTIN contract without numeric conversion.
export function isValidProductBarcode(value: unknown): value is string {
  return typeof value === "string" && [8, 12, 13, 14].includes(value.length) && !/[^0-9]/.test(value);
}
