import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

function extractRequestId(event: Sentry.ErrorEvent): string | undefined {
  const headers = event.request?.headers;
  if (!headers) return undefined;
  const value = (headers["x-request-id"] ?? headers["X-Request-Id"] ?? headers["x-requestid"]) as
    | string
    | string[]
    | undefined;
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0,
  environment: process.env.APP_ENV ?? process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV,
  beforeSend(event) {
    const requestId = extractRequestId(event);
    if (!requestId) return event;
    event.tags = { ...event.tags, request_id: requestId };
    event.extra = { ...event.extra, request_id: requestId };
    return event;
  },
});
