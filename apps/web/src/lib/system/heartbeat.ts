import type { Sql } from "postgres";

export type HeartbeatStatus = "ok" | "degraded" | "error";

export async function upsertServiceHeartbeat(
  sql: Sql,
  args: {
    service: string;
    status?: HeartbeatStatus;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const service = String(args.service ?? "").trim();
  if (!service) return;

  const status: HeartbeatStatus = args.status ?? "ok";
  const details = args.details ?? {};

  await sql`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${service},
      ${status},
      ${(sql as any).json(details)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (service) DO UPDATE
      SET status = EXCLUDED.status,
          details_json = EXCLUDED.details_json,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = EXCLUDED.updated_at
  `;
}

export type HeartbeatRow = {
  service: string;
  status: HeartbeatStatus;
  details_json: unknown;
  last_seen_at: string;
};

export async function listServiceHeartbeats(sql: Sql): Promise<HeartbeatRow[]> {
  return await sql<HeartbeatRow[]>`
    SELECT
      service,
      status,
      details_json,
      last_seen_at::text
    FROM app_service_heartbeat
    ORDER BY service ASC
  `;
}
