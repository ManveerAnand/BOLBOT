import { describe, expect, it } from "vitest";
import { webhookUsername } from "../../../src/messages/webhookUsername";

describe("webhookUsername", () => {
  it("uses the person's name and strips Discord-forbidden fragments", () => {
    expect(webhookUsername("  Chen  ")).toBe("Chen");
    expect(webhookUsername("discordFan")).toBe("Fan");
    expect(webhookUsername("")).toBe("Member");
  });
});
