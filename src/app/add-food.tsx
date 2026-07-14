import { useLocalSearchParams, useRouter } from "expo-router";

import { FoodEntryForm } from "../components/FoodEntryForm";
import { useFoodLogs } from "../context/FoodLogContext";
import type { NewFoodLog } from "../types/food";
import { resolveDiaryDateParam } from "../utils/diaryRoute";

export default function AddFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addFoodLog } = useFoodLogs();

  const loggedDate = resolveDiaryDateParam(params.loggedDate);

  const handleSubmit = (foodLog: NewFoodLog) => {
    addFoodLog(foodLog, loggedDate);

    router.replace({
      pathname: "/dashboard",
      params: {
        loggedDate,
      },
    });
  };

  return (
    <FoodEntryForm
      title="Manual entry"
      subtitle="Enter the nutrition details and save this food to your diary."
      loggedDate={loggedDate}
      submitLabel="Save to diary"
      cancelLabel="Back to search"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
