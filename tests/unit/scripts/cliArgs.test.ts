import { describe, expect, it } from "vitest";
import { parseNamedArgs, requiredString } from "../../../scripts/cliArgs";

describe("parseNamedArgs", () => {
  it("parses smoke-test flags", () => {
    const args = parseNamedArgs([
      "--from",
      "zh",
      "--to",
      "en",
      "--text",
      "今晚有人想一起玩吗？",
    ]);

    expect(requiredString(args, "from")).toBe("zh");
    expect(requiredString(args, "to")).toBe("en");
    expect(requiredString(args, "text")).toBe("今晚有人想一起玩吗？");
  });
});
