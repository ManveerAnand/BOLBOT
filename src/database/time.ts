export function nowIso(): string {
  return new Date().toISOString();
}

export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function boolFromSql(value: number): boolean {
  return value === 1;
}

export function sqlFromBool(value: boolean): number {
  return value ? 1 : 0;
}
