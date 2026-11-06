import { TRANSLATOR_ROLE_PREFIX } from "../../config/constants.js";
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../../language/registry.js";

export interface TranslatorRole {
  id: string;
  name: string;
}

export interface TranslatorRolePort {
  findRole(roleId: string): TranslatorRole | undefined;
  findRoleByName(name: string): TranslatorRole | undefined;
  createRole(name: string): Promise<TranslatorRole>;
  memberRoleIds(): string[];
  addMemberRole(roleId: string): Promise<void>;
  removeMemberRole(roleId: string): Promise<void>;
  refreshRoles?(): Promise<void>;
}

export function translatorRoleName(language: SupportedLanguage): string {
  return `${TRANSLATOR_ROLE_PREFIX}${language.displayName}`;
}

export function languageFromTranslatorRoleName(
  name: string,
): SupportedLanguage | undefined {
  if (!name.startsWith(TRANSLATOR_ROLE_PREFIX)) {
    return undefined;
  }
  const displayName = name.slice(TRANSLATOR_ROLE_PREFIX.length);
  return SUPPORTED_LANGUAGES.find(
    (language) => language.displayName === displayName,
  );
}

export function isManagedTranslatorRoleName(name: string): boolean {
  return languageFromTranslatorRoleName(name) !== undefined;
}

export function rolesToAssign(input: {
  memberRoleIds: string[];
  managedRoleIds: string[];
  targetRoleId: string;
}): { add: string[]; remove: string[] } {
  const managed = new Set(input.managedRoleIds);
  const member = new Set(input.memberRoleIds);
  return {
    add: member.has(input.targetRoleId) ? [] : [input.targetRoleId],
    remove: input.memberRoleIds.filter(
      (roleId) => managed.has(roleId) && roleId !== input.targetRoleId,
    ),
  };
}
