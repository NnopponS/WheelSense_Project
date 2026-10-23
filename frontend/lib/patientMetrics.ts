/** BMI from metric height/weight; returns null if inputs invalid. */
export function bodyMassIndex(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (heightCm == null || weightKg == null) return null;
  const h = heightCm / 100;
  if (h <= 0 || weightKg <= 0) return null;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

export function bmiCategory(
  bmi: number | null,
): "underweight" | "normal" | "overweight" | "obese" | null {
  if (bmi == null) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}
