export type ToleranceOptions = {
  valueTolerance: number;
  percentageTolerance: number;
};

export function withinTolerance(
  expected: number,
  actual: number,
  options: ToleranceOptions,
): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  const delta = Math.abs(actual - expected);
  if (delta <= options.valueTolerance) return true;
  if (expected === 0) return delta <= options.valueTolerance;
  const pct = (delta / Math.abs(expected)) * 100;
  return pct <= options.percentageTolerance;
}
