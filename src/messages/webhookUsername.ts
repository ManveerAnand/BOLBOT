const FORBIDDEN_USERNAME = /discord|clyde/gi;
const FORBIDDEN_USERNAME_CHARS = /[@#:`]/g;

export function webhookUsername(displayName: string): string {
  let base = displayName.replaceAll(/\s+/g, " ").trim();
  base = base.replace(FORBIDDEN_USERNAME, "").replace(FORBIDDEN_USERNAME_CHARS, "");
  base = base.replaceAll(/\s+/g, " ").trim() || "Member";
  return base.slice(0, 80);
}
