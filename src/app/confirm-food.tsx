import { useLocalSearchParams, useRouter } from "expo-router";

import {
  FoodEntryForm,
  type FoodEntryInitialValues,
} from "../components/FoodEntryForm";
import { useFoodLogs } from "../context/FoodLogContext";
import type { NewFoodLog } from "../types/food";
import { resolveDiaryDateParam } from "../utils/diaryRoute";
import { getDefaultMealType, isMealType } from "../utils/meal";

function getParamValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function ConfirmFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addFoodLog, isFoodLogMutationPending } = useFoodLogs();

  const loggedDate = resolveDiaryDateParam(params.loggedDate);

  const requestedMealType = getParamValue(params.mealType);

  const initialValues: FoodEntryInitialValues = {
    mealType: isMealType(requestedMealType)
      ? requestedMealType
      : getDefaultMealType(),
    foodName: getParamValue(params.foodName),
    calories: getParamValue(params.calories),
    protein: getParamValue(params.protein),
    carbs: getParamValue(params.carbs),
    fat: getParamValue(params.fat),
  };

  const handleSubmit = async (foodLog: NewFoodLog) => {
    const succeeded = await addFoodLog(foodLog, loggedDate);

    if (succeeded) {
      router.replace({
        pathname: "/dashboard",
        params: {
          loggedDate,
        },
      });
    }

    return succeeded;
  };

  return (
    <FoodEntryForm
      title="Confirm food"
      subtitle="Review and edit the nutrition details before saving this food to your diary."
      loggedDate={loggedDate}
      initialValues={initialValues}
      submitLabel="Save to diary"
      cancelLabel="Back to search"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      disabled={isFoodLogMutationPending}
    />
  );
}
