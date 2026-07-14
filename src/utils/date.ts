function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());

  return `${year}-${month}-${day}`;
}

export function getLocalDateKeyFromIso(isoDate: string): string | null {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getLocalDateKey(date);
}
