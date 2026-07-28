import {
  HEALTH_PROFILE_LIMITS,
  type ActivityLevel,
  type HealthProfile,
  type NutritionGoal,
} from "../../types/healthProfile";
import {
  NUTRITION_TARGET_LIMITS,
  type NutritionTargets,
} from "../../types/nutrition";

export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  "lightly-active": 1.375,
  "moderately-active": 1.55,
  "very-active": 1.725,
};

export const GOAL_ADJUSTMENTS: Readonly<Record<NutritionGoal, number>> = {
  "lose-gradually": -250,
  maintain: 0,
  "gain-gradually": 250,
};

export type NutritionEstimate = {
  bmr: number;
  maintenanceCalories: number;
  goalAdjustment: number;
  targets: NutritionTargets;
};

export type NutritionEstimateResult =
  | { ok: true; estimate: NutritionEstimate }
  | { ok: false; reason: string };

function isWholeNumberInRange(
  value: number,
  limits: Readonly<{ min: number; max: number }>,
) {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
  );
}

function isNumberInRange(
  value: number,
  limits: Readonly<{ min: number; max: number }>,
) {
  return Number.isFinite(value) && value >= limits.min && value <= limits.max;
}

function targetsAreValid(targets: NutritionTargets) {
  return (Object.keys(targets) as Array<keyof NutritionTargets>).every((key) =>
    isWholeNumberInRange(targets[key], NUTRITION_TARGET_LIMITS[key]),
  );
}

export function estimateNutritionTargets(
  profile: HealthProfile,
): NutritionEstimateResult {
  if (
    !isWholeNumberInRange(profile.age, HEALTH_PROFILE_LIMITS.age) ||
    !isNumberInRange(profile.heightCm, HEALTH_PROFILE_LIMITS.heightCm) ||
    !isNumberInRange(profile.weightKg, HEALTH_PROFILE_LIMITS.weightKg)
  ) {
    return {
      ok: false,
      reason: "Enter a valid adult health profile within the technical limits.",
    };
  }

  if (profile.calculationSex === "prefer-not-to-say") {
    return {
      ok: false,
      reason:
        "Mifflin–St Jeor requires a calculation sex. You can save this choice and set nutrition targets manually.",
    };
  }

  // Mifflin–St Jeor BMR: 10W + 6.25H - 5A, then +5 male / -161 female.
  const sexConstant = profile.calculationSex === "male" ? 5 : -161;
  const bmr =
    10 * profile.weightKg +
    6.25 * profile.heightCm -
    5 * profile.age +
    sexConstant;
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const goalAdjustment = GOAL_ADJUSTMENTS[profile.goal];
  const maintenanceCalories = bmr * multiplier;
  const finalCalories = Math.round(maintenanceCalories + goalAdjustment);
  // First-version macro split: 25% protein, 45% carbohydrate, 30% fat.
  // Protein/carbohydrate use 4 kcal/g and fat uses 9 kcal/g.
  const targets: NutritionTargets = {
    calories: finalCalories,
    protein: Math.round((finalCalories * 0.25) / 4),
    carbs: Math.round((finalCalories * 0.45) / 4),
    fat: Math.round((finalCalories * 0.3) / 9),
  };

  if (
    !Number.isFinite(bmr) ||
    bmr <= 0 ||
    !Number.isFinite(maintenanceCalories) ||
    maintenanceCalories <= 0 ||
    !targetsAreValid(targets)
  ) {
    return {
      ok: false,
      reason:
        "The estimate falls outside CaloriBite’s nutrition-target technical limits, so automatic estimation is unavailable. You can still set targets manually.",
    };
  }

  return {
    ok: true,
    estimate: {
      bmr: Math.round(bmr),
      maintenanceCalories: Math.round(maintenanceCalories),
      goalAdjustment,
      targets,
    },
  };
}

export function runNutritionEstimatorChecks(): ReadonlyArray<string> {
  const failures: string[] = [];
  const firstExample = estimateNutritionTargets({
    age: 30,
    heightCm: 175,
    weightKg: 70,
    calculationSex: "male",
    activityLevel: "moderately-active",
    goal: "maintain",
  });
  const secondExample = estimateNutritionTargets({
    age: 40,
    heightCm: 165,
    weightKg: 60,
    calculationSex: "female",
    activityLevel: "lightly-active",
    goal: "lose-gradually",
  });

  if (
    !firstExample.ok ||
    firstExample.estimate.bmr !== 1649 ||
    firstExample.estimate.maintenanceCalories !== 2556 ||
    firstExample.estimate.targets.calories !== 2556 ||
    firstExample.estimate.targets.protein !== 160 ||
    firstExample.estimate.targets.carbs !== 288 ||
    firstExample.estimate.targets.fat !== 85
  ) {
    failures.push("Documented male maintenance example");
  }

  if (
    !secondExample.ok ||
    secondExample.estimate.bmr !== 1270 ||
    secondExample.estimate.maintenanceCalories !== 1747 ||
    secondExample.estimate.targets.calories !== 1497 ||
    secondExample.estimate.targets.protein !== 94 ||
    secondExample.estimate.targets.carbs !== 168 ||
    secondExample.estimate.targets.fat !== 50
  ) {
    failures.push("Documented female gradual-loss example");
  }

  const noSex = estimateNutritionTargets({
    age: 30,
    heightCm: 180,
    weightKg: 80,
    calculationSex: "prefer-not-to-say",
    activityLevel: "sedentary",
    goal: "maintain",
  });
  if (noSex.ok) failures.push("Calculation-sex requirement");

  const nonPositiveResult = estimateNutritionTargets({
    age: 120,
    heightCm: 100,
    weightKg: 30,
    calculationSex: "female",
    activityLevel: "sedentary",
    goal: "lose-gradually",
  });
  if (nonPositiveResult.ok) {
    failures.push("Non-positive out-of-range estimate rejection");
  }

  return failures;
}
