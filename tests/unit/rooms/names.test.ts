import { describe, expect, it } from "vitest";
import {
  isValidRoomSlug,
  normalizeRoomSlug,
  roomCategoryName,
  viewChannelName,
} from "../../../src/rooms/names";

describe("room names", () => {
  it("normalizes and validates slugs", () => {
    expect(normalizeRoomSlug("General Chat")).toBe("general-chat");
    expect(isValidRoomSlug("general")).toBe(true);
    expect(isValidRoomSlug("Nope")).toBe(false);
  });

  it("builds predictable Discord names", () => {
    expect(roomCategoryName("general")).toBe("translator-general");
    expect(viewChannelName("general", "zh")).toBe("general-zh");
  });
});
