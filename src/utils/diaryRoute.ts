import { getLocalDateKey, parseLocalDateKey } from "./date";

type RouteParam = string | string[] | undefined;

export function resolveDiaryDateParam(value: RouteParam): string {
  const requestedDate = Array.isArray(value) ? value[0] : value;

  const todayDateKey = getLocalDateKey();

  const isValidRequestedDate =
    requestedDate !== undefined &&
    parseLocalDateKey(requestedDate) !== null &&
    requestedDate <= todayDateKey;

  return isValidRequestedDate ? requestedDate : todayDateKey;
}
