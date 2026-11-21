import { z } from "zod";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS_DEFAULTS, type SettingKey } from "@/lib/settings-defaults";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use a #RRGGBB colour");
const schemas: Record<SettingKey, z.ZodTypeAny> = {
  branding: z.object({
    name: z.string().trim().min(2).max(120), shortName: z.string().trim().min(1).max(40), tagline: z.string().trim().max(120),
    primaryColor: hex, accentColor: hex,
    logoDataUrl: z.string().max(400_000).regex(/^data:image\/(png|jpeg|svg\+xml|webp);base64,/, "logo must be PNG, JPEG, SVG or WebP").nullable(),
  }),
  workflow: z.object({ requireApprovalForChanges: z.boolean(), requireReason: z.boolean(), allowRequestsWhenLocked: z.boolean(), notifyOnDirectChanges: z.boolean() }),
  modules: z.record(z.string(), z.boolean()),
  dashboard: z.object({ widgets: z.array(z.string()) }),
  security: z.object({ sessionHours: z.number().int().min(1).max(72), maxFailedAttempts: z.number().int().min(3).max(20), lockoutMinutes: z.number().int().min(1).max(1440), minPasswordLength: z.number().int().min(8).max(64) }),
  backup: z.object({ autoEnabled: z.boolean(), intervalHours: z.number().int().min(1).max(720), keep: z.number().int().min(1).max(365) }),
};

export const PUT = route("settings.manage", async (req, s) => {
  const { key, value } = z.object({ key: z.string(), value: z.unknown() }).parse(await req.json());
  if (!(key in SETTINGS_DEFAULTS)) throw new ApiError(400, "Unknown setting");
  if ((key === "security" || key === "backup") && !s.permissions.has("backups.manage") && !s.permissions.has("roles.manage"))
    throw new ApiError(403, "Security settings require administrator rights");
  const parsed = schemas[key as SettingKey].parse(value) as Record<string, unknown>;
  const before = await getSetting(key as SettingKey);
  await setSetting(key as SettingKey, parsed, s.user.id);
  const logged = key === "branding" ? { ...parsed, logoDataUrl: parsed.logoDataUrl ? "(image)" : null } : parsed;
  const beforeLogged = key === "branding" ? { ...(before as object), logoDataUrl: (before as { logoDataUrl?: string }).logoDataUrl ? "(image)" : null } : before;
  await audit(s.user.id, "SETTINGS_UPDATED", "system_settings", key, { before: beforeLogged, after: logged }, requireIp(req));
  return { ok: true };
});
