const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());

  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValidDate ? date : null;
}

export function getLocalDateKeyFromIso(isoDate: string): string | null {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getLocalDateKey(date);
}

export function addDaysToDateKey(
  dateKey: string,
  numberOfDays: number,
): string | null {
  const date = parseLocalDateKey(dateKey);

  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + numberOfDays);

  return getLocalDateKey(date);
}

export function formatDiaryDate(
  dateKey: string,
  today: Date = new Date(),
): string {
  const date = parseLocalDateKey(dateKey);

  if (!date) {
    return dateKey;
  }

  const todayDateKey = getLocalDateKey(today);
  const yesterdayDateKey = addDaysToDateKey(todayDateKey, -1);

  if (dateKey === todayDateKey) {
    return "Today";
  }

  if (dateKey === yesterdayDateKey) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
