import { describe, expect, it } from "vitest";
import { languageCommand } from "../../../src/discord/commands/language";

describe("languageCommand", () => {
  it("registers set, show, and list", () => {
    const json = languageCommand().toJSON();
    expect(json.name).toBe("language");
    expect(json.dm_permission).toBe(false);
    expect(json.options?.map((option) => option.name)).toEqual([
      "set",
      "show",
      "list",
    ]);
  });
});
