import { describe, expect, it } from "vitest";
import { translatorRoleName, rolesToAssign } from "../../../src/discord/roles/translatorRoles";
import { requireSupportedLanguage } from "../../../src/language/registry";

describe("translator roles", () => {
  it("uses the architecture role names", () => {
    expect(translatorRoleName(requireSupportedLanguage("en"))).toBe(
      "Translator · English",
    );
    expect(translatorRoleName(requireSupportedLanguage("id"))).toBe(
      "Translator · Indonesian",
    );
  });

  it("keeps one managed translator role and leaves unrelated roles", () => {
    const plan = rolesToAssign({
      memberRoleIds: ["everyone", "mod", "old-zh", "target-en"],
      managedRoleIds: ["old-zh", "target-en"],
      targetRoleId: "target-en",
    });
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual(["old-zh"]);
  });
});
