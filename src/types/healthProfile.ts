export type CalculationSex = "female" | "male" | "prefer-not-to-say";

export type ActivityLevel =
  | "sedentary"
  | "lightly-active"
  | "moderately-active"
  | "very-active";

export type NutritionGoal =
  | "lose-gradually"
  | "maintain"
  | "gain-gradually";

export type HealthProfile = {
  age: number;
  heightCm: number;
  weightKg: number;
  calculationSex: CalculationSex;
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
};

export const HEALTH_PROFILE_LIMITS = {
  age: { min: 18, max: 120 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 350 },
} as const;

export const ACTIVITY_LEVELS: ReadonlyArray<
  Readonly<{ value: ActivityLevel; label: string }>
> = [
  { value: "sedentary", label: "Sedentary" },
  { value: "lightly-active", label: "Lightly active" },
  { value: "moderately-active", label: "Moderately active" },
  { value: "very-active", label: "Very active" },
];

export const NUTRITION_GOALS: ReadonlyArray<
  Readonly<{ value: NutritionGoal; label: string }>
> = [
  { value: "lose-gradually", label: "Lose weight gradually" },
  { value: "maintain", label: "Maintain weight" },
  { value: "gain-gradually", label: "Gain weight gradually" },
];

export const CALCULATION_SEX_OPTIONS: ReadonlyArray<
  Readonly<{ value: CalculationSex; label: string }>
> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];
