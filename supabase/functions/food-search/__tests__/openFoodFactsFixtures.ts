// Minimal synthetic data only. No downloaded product records or personal data.
export const PRODUCT_CODE = "0012345678905";
export function openFoodFactsProduct() {
  return {
    code: PRODUCT_CODE,
    product_name: "  Synthetic oat bites  ",
    brands: "Fixture Foods",
    nutriments: { "energy-kcal_100g": 165, proteins_100g: 5, carbohydrates_100g: 25, fat_100g: 0 },
    serving_size: "30 g",
    serving_quantity: 30,
    serving_quantity_unit: "g",
    product_quantity_unit: "g",
  };
}
