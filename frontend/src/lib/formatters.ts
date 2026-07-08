export function formatCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

export function formatSinceYesterdayDelta(value: number | null | undefined) {
  const normalizedValue = value ?? 0;
  return normalizedValue > 0
    ? `+${formatCompactNumber(normalizedValue)} since yesterday`
    : "0 since yesterday";
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(
  value: string | null | undefined,
  fallback = "Not available",
) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

export function formatOptionalTimestamp(
  value: string | null | undefined,
  fallback = "No activity",
) {
  return value ? formatTimestamp(value) : fallback;
}

export function formatRelativeTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diff = timestamp - Date.now();
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 1000 * 60 * 60 * 24 * 365, unit: "year" },
    { amount: 1000 * 60 * 60 * 24 * 30, unit: "month" },
    { amount: 1000 * 60 * 60 * 24 * 7, unit: "week" },
    { amount: 1000 * 60 * 60 * 24, unit: "day" },
    { amount: 1000 * 60 * 60, unit: "hour" },
    { amount: 1000 * 60, unit: "minute" },
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const absoluteDiff = Math.abs(diff);
  const division =
    divisions.find((item) => absoluteDiff >= item.amount) ??
    ({ amount: 1000, unit: "second" } satisfies {
      amount: number;
      unit: Intl.RelativeTimeFormatUnit;
    });

  return formatter.format(Math.round(diff / division.amount), division.unit);
}

export function formatLabelValue(
  value: string | null | undefined,
  fallback = "Not available",
) {
  if (!value?.trim()) {
    return fallback;
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
