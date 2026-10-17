import type { FoodSearchResult } from "../../types/foodSearch";
import { nutritionInputs, parseNutritionInputs, type NutritionInputs } from "./confirmationNutrition";
import { validateTransportFood } from "./foodResultTransport";
import { isValidProductBarcode } from "./barcodeValidation";

export type LibraryFoodInputs = NutritionInputs & { name: string; brand: string; barcode: string; servingGrams: string };

export function libraryFoodInputs(food?: FoodSearchResult): LibraryFoodInputs {
  const serving = food?.servingOptions.find((option) => option.id === food.defaultServingId) ?? food?.servingOptions[0];
  return { ...nutritionInputs(food?.nutritionPer100g ?? null), name: food?.name ?? "", brand: food?.brand ?? "", barcode: food?.barcode ?? "", servingGrams: serving ? String(serving.grams) : "" };
}

export function libraryFoodFromInputs(inputs: LibraryFoodInputs, localId: string, existing?: FoodSearchResult): FoodSearchResult | null {
  const nutritionPer100g = parseNutritionInputs(inputs);
  if (!nutritionPer100g || !inputs.name.trim() || (inputs.barcode !== "" && !isValidProductBarcode(inputs.barcode))) return null;
  const grams = inputs.servingGrams.trim() ? Number(inputs.servingGrams) : null;
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0)) return null;
  const oldDefault = existing?.servingOptions.find((option) => option.id === existing.defaultServingId) ?? existing?.servingOptions[0];
  const defaultId = oldDefault?.id ?? "my-default";
  const servingOptions = (existing?.servingOptions ?? []).flatMap((option) => option.id === defaultId
    ? grams === null ? [] : [{ ...option, grams }] : [option]);
  if (grams !== null && !oldDefault) servingOptions.push({ id: defaultId, label: "Default serving", grams });
  const sameBarcode = !!inputs.barcode && existing?.barcode === inputs.barcode;
  return validateTransportFood({
    source: "custom", localId, name: inputs.name.trim(),
    ...(inputs.brand.trim() ? { brand: inputs.brand.trim() } : {}),
    ...(inputs.barcode ? { barcode: inputs.barcode, externalId: inputs.barcode } : {}),
    nutritionPer100g, servingOptions,
    ...(grams !== null ? { defaultServingId: defaultId } : {}),
    attributionLabel: sameBarcode ? existing.attributionLabel : "Your saved food",
  });
}
