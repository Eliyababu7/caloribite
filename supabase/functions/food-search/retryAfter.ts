const MAX_RETRY_AFTER_SECONDS = 3_600;

export function sanitizeRetryAfter(
  value: string | null,
  now = Date.now(),
): string | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  let seconds: number;
  if (/^\d+$/.test(trimmed)) {
    seconds = Number(trimmed);
  } else {
    if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) {
      return undefined;
    }
    const retryAt = Date.parse(trimmed);
    if (!Number.isFinite(retryAt)) {
      return undefined;
    }
    seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  }

  if (!Number.isFinite(seconds)) {
    return undefined;
  }

  return String(Math.min(Math.max(seconds, 0), MAX_RETRY_AFTER_SECONDS));
}
