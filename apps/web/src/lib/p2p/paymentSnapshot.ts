export type PaymentMethodSnapshot = {
  id?: string;
  identifier: string;
  name: string;
  details: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyPrimitive(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return false;
}

export function normalizePaymentMethodSnapshot(raw: unknown): PaymentMethodSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const normalized: PaymentMethodSnapshot[] = [];

  for (const item of raw) {
    if (!isRecord(item)) continue;

    const identifier = typeof item.identifier === "string" ? item.identifier.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : identifier;
    const id = typeof item.id === "string" ? item.id : undefined;
    const details = isRecord(item.details) ? item.details : null;

    if (!identifier && !name) continue;

    normalized.push({
      id,
      identifier: identifier || name,
      name: name || identifier,
      details,
    });
  }

  return normalized;
}

export function hasUsablePaymentDetails(snapshot: PaymentMethodSnapshot[]): boolean {
  if (!snapshot.length) return false;

  return snapshot.some((method) => {
    if (!method.details || !isRecord(method.details)) return false;
    return Object.values(method.details).some(hasNonEmptyPrimitive);
  });
}
