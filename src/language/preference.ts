import type { AppDatabase } from "../database/db.js";
import { EnabledLanguageRepository } from "../database/repositories/enabledLanguages.js";
import { MemberPreferenceRepository } from "../database/repositories/memberPreferences.js";
import type { SupportedLanguage } from "./registry.js";
import { resolveLanguageChoice, SUPPORTED_LANGUAGES } from "./registry.js";
import {
  isManagedTranslatorRoleName,
  rolesToAssign,
  translatorRoleName,
  type TranslatorRolePort,
} from "../discord/roles/translatorRoles.js";

export class LanguagePreferenceError extends Error {
  constructor(
    readonly code: "unsupported" | "language_cap",
    message: string,
  ) {
    super(message);
    this.name = "LanguagePreferenceError";
  }
}

export function formatLanguageList(input: {
  enabledCodes: ReadonlySet<string>;
  preferredLanguage: string | undefined;
}): string {
  const lines = SUPPORTED_LANGUAGES.map((language) => {
    const mark = input.enabledCodes.has(language.internalCode)
      ? "enabled"
      : "available";
    return `${language.displayName} (${language.internalCode}) — ${mark}`;
  });
  const preferred = input.preferredLanguage
    ? resolveLanguageChoice(input.preferredLanguage)
    : undefined;
  return [
    "Use /language set to choose one:",
    "",
    ...lines,
    "",
    preferred
      ? `Your preference: ${preferred.displayName} (${preferred.internalCode})`
      : "Your preference is not set yet.",
  ].join("\n");
}

export function formatLanguageShow(
  preferredLanguage: string | undefined,
): string {
  const language = preferredLanguage
    ? resolveLanguageChoice(preferredLanguage)
    : undefined;
  if (!language) {
    return "You have not set a preferred language yet. Use /language set.";
  }
  return `Your preferred language is ${language.displayName} (${language.internalCode}).`;
}

export async function setMemberLanguagePreference(input: {
  db: AppDatabase;
  roles: TranslatorRolePort;
  guildId: string;
  userId: string;
  languageInput: string;
  maxEnabledLanguages: number;
}): Promise<{
  language: SupportedLanguage;
  roleId: string;
  roleCreated: boolean;
  previousLanguage: string | undefined;
  roleSyncFailed: boolean;
}> {
  const language = resolveLanguageChoice(input.languageInput);
  if (!language) {
    throw new LanguagePreferenceError(
      "unsupported",
      "I don't support that language. Use /language list.",
    );
  }

  const languages = new EnabledLanguageRepository(input.db);
  const preferences = new MemberPreferenceRepository(input.db);
  const previous = preferences.get(input.guildId, input.userId);
  const existing = languages.get(input.guildId, language.internalCode);
  const enablingNew = !existing?.enabled;
  if (
    enablingNew &&
    languages.listEnabled(input.guildId).length >= input.maxEnabledLanguages
  ) {
    throw new LanguagePreferenceError(
      "language_cap",
      `This server already has ${input.maxEnabledLanguages} languages enabled.`,
    );
  }

  await input.roles.refreshRoles?.();
  const ensured = await ensureTranslatorRole(
    languages,
    input.roles,
    input.guildId,
    language,
  );

  preferences.set({
    guildId: input.guildId,
    userId: input.userId,
    preferredLanguage: language.internalCode,
  });

  let roleSyncFailed = false;
  try {
    await syncMemberTranslatorRoles(
      languages,
      input.roles,
      input.guildId,
      ensured.roleId,
    );
  } catch {
    roleSyncFailed = true;
  }

  return {
    language,
    roleId: ensured.roleId,
    roleCreated: ensured.created,
    previousLanguage: previous?.preferredLanguage,
    roleSyncFailed,
  };
}

export async function ensureTranslatorRole(
  languages: EnabledLanguageRepository,
  roles: TranslatorRolePort,
  guildId: string,
  language: SupportedLanguage,
): Promise<{ roleId: string; created: boolean }> {
  const name = translatorRoleName(language);
  const stored = languages.get(guildId, language.internalCode);
  const byId = stored ? roles.findRole(stored.roleId) : undefined;
  if (byId) {
    languages.upsert({
      guildId,
      languageCode: language.internalCode,
      roleId: byId.id,
      enabled: true,
    });
    return { roleId: byId.id, created: false };
  }

  const byName = roles.findRoleByName(name);
  if (byName) {
    languages.upsert({
      guildId,
      languageCode: language.internalCode,
      roleId: byName.id,
      enabled: true,
    });
    return { roleId: byName.id, created: false };
  }

  const created = await roles.createRole(name);
  languages.upsert({
    guildId,
    languageCode: language.internalCode,
    roleId: created.id,
    enabled: true,
  });
  return { roleId: created.id, created: true };
}

async function syncMemberTranslatorRoles(
  languages: EnabledLanguageRepository,
  roles: TranslatorRolePort,
  guildId: string,
  targetRoleId: string,
): Promise<void> {
  const managedRoleIds = new Set(languages.list(guildId).map((row) => row.roleId));
  for (const roleId of roles.memberRoleIds()) {
    const role = roles.findRole(roleId);
    if (role && isManagedTranslatorRoleName(role.name)) {
      managedRoleIds.add(roleId);
    }
  }

  const plan = rolesToAssign({
    memberRoleIds: roles.memberRoleIds(),
    managedRoleIds: [...managedRoleIds],
    targetRoleId,
  });

  for (const roleId of plan.remove) {
    await roles.removeMemberRole(roleId);
  }
  for (const roleId of plan.add) {
    await roles.addMemberRole(roleId);
  }
}
