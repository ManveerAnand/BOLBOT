import { describe, expect, it } from "vitest";
import { needsInference, selectFanOutViews } from "../../../src/messages/targets";
import type { RoomView } from "../../../src/database/types";

function view(
  overrides: Partial<RoomView> & Pick<RoomView, "id" | "languageCode">,
): RoomView {
  return {
    roomId: "r1",
    channelId: `c-${overrides.languageCode}`,
    webhookId: null,
    webhookTokenCiphertext: null,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("selectFanOutViews", () => {
  it("returns other enabled views in the same room", () => {
    const source = view({ id: "zh", languageCode: "zh" });
    const targets = selectFanOutViews(source, [
      source,
      view({ id: "en", languageCode: "en" }),
      view({ id: "id", languageCode: "id", enabled: false }),
    ]);
    expect(targets.map((item) => item.languageCode)).toEqual(["en"]);
  });
});

describe("needsInference", () => {
  it("is false when source and target languages match", () => {
    expect(needsInference("zh", "zh")).toBe(false);
    expect(needsInference("zh", "en")).toBe(true);
  });
});
