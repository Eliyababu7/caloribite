// Display only: never use these strings for storage, calculations, or inputs.
const calories = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const grams = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const percentages = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
  useGrouping: false,
});

export function isNutritionNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function format(value: unknown, formatter: Intl.NumberFormat): string {
  return isNutritionNumber(value) ? formatter.format(value === 0 ? 0 : value) : "Unavailable";
}

export const formatCalories = (value: unknown): string => format(value, calories);
export const formatMacroGrams = (value: unknown): string => format(value, grams);
export const formatPercentage = (value: unknown): string => format(value, percentages);
