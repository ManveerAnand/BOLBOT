import { describe, expect, it } from "vitest";
import { EnabledLanguageRepository } from "../../../src/database/repositories/enabledLanguages";
import { MemberPreferenceRepository } from "../../../src/database/repositories/memberPreferences";
import {
  formatLanguageShow,
  LanguagePreferenceError,
  setMemberLanguagePreference,
} from "../../../src/language/preference";
import type { TranslatorRolePort } from "../../../src/discord/roles/translatorRoles";
import { openTestDatabase } from "../database/testDb";

class FakeRolePort implements TranslatorRolePort {
  readonly roles = new Map<string, { id: string; name: string }>();
  readonly memberIds = new Set<string>();
  private nextId = 1;

  findRole(roleId: string) {
    return this.roles.get(roleId);
  }

  findRoleByName(name: string) {
    return [...this.roles.values()].find((role) => role.name === name);
  }

  async createRole(name: string) {
    const role = { id: `role-${this.nextId}`, name };
    this.nextId += 1;
    this.roles.set(role.id, role);
    return role;
  }

  memberRoleIds() {
    return [...this.memberIds];
  }

  async addMemberRole(roleId: string) {
    this.memberIds.add(roleId);
  }

  async removeMemberRole(roleId: string) {
    this.memberIds.delete(roleId);
  }
}

describe("language preference", () => {
  it("shows an unset preference", () => {
    expect(formatLanguageShow(undefined)).toMatch(/not set/);
  });

  it("persists preference, creates one role, and does not remove unrelated roles", async () => {
    const db = openTestDatabase();
    const roles = new FakeRolePort();
    roles.memberIds.add("mod-role");
    roles.roles.set("mod-role", { id: "mod-role", name: "Moderator" });

    const first = await setMemberLanguagePreference({
      db,
      roles,
      guildId: "g1",
      userId: "u1",
      languageInput: "English",
      maxEnabledLanguages: 8,
    });
    const second = await setMemberLanguagePreference({
      db,
      roles,
      guildId: "g1",
      userId: "u1",
      languageInput: "zh",
      maxEnabledLanguages: 8,
    });

    const preferences = new MemberPreferenceRepository(db);
    const enabled = new EnabledLanguageRepository(db);

    expect(first.language.internalCode).toBe("en");
    expect(second.language.internalCode).toBe("zh");
    expect(second.previousLanguage).toBe("en");
    expect(preferences.get("g1", "u1")?.preferredLanguage).toBe("zh");
    expect(roles.memberIds.has("mod-role")).toBe(true);
    expect(roles.memberIds.has(first.roleId)).toBe(false);
    expect(roles.memberIds.has(second.roleId)).toBe(true);
    expect(enabled.listEnabled("g1").map((row) => row.languageCode)).toEqual([
      "en",
      "zh",
    ]);
    db.close();
  });

  it("rejects a new language after the cap", async () => {
    const db = openTestDatabase();
    const roles = new FakeRolePort();
    await setMemberLanguagePreference({
      db,
      roles,
      guildId: "g1",
      userId: "u1",
      languageInput: "en",
      maxEnabledLanguages: 1,
    });

    await expect(
      setMemberLanguagePreference({
        db,
        roles,
        guildId: "g1",
        userId: "u2",
        languageInput: "id",
        maxEnabledLanguages: 1,
      }),
    ).rejects.toBeInstanceOf(LanguagePreferenceError);
    db.close();
  });
});
