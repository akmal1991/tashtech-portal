import "server-only";
import { sql, type Tx } from "./db";

export async function audit(
  userId: number | null,
  action: string,
  entity: string | null,
  entityId: string | number | null,
  details: Record<string, unknown> | null = null,
  ip: string | null = null,
  tx: Tx = sql,
) {
  await tx`insert into audit_logs (user_id, action, entity, entity_id, details, ip)
    values (${userId}, ${action}, ${entity}, ${entityId == null ? null : String(entityId)}, ${details ? tx.json(details as never) : null}, ${ip})`;
}

/** Notify every active user whose role holds the permission (optionally excluding one user). */
export async function notifyPermission(
  permission: string,
  n: { type: string; title: string; body?: string; link?: string },
  excludeUserId?: number,
  tx: Tx = sql,
) {
  await tx`insert into notifications (user_id, type, title, body, link)
    select u.id, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.link ?? null}
    from users u join role_permissions rp on rp.role_id = u.role_id
    where rp.permission_code = ${permission} and u.is_active and u.id <> ${excludeUserId ?? -1}`;
}

export async function notifyUser(userId: number, n: { type: string; title: string; body?: string; link?: string }, tx: Tx = sql) {
  await tx`insert into notifications (user_id, type, title, body, link) values (${userId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.link ?? null})`;
}
