import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LogicalMessageRepository } from "../../../src/database/repositories/logicalMessages";
import { LogicalRoomRepository } from "../../../src/database/repositories/logicalRooms";
import { MemberPreferenceRepository } from "../../../src/database/repositories/memberPreferences";
import { MessageCopyRepository } from "../../../src/database/repositories/messageCopies";
import { PendingJobRepository } from "../../../src/database/repositories/pendingJobs";
import { RoomViewRepository } from "../../../src/database/repositories/roomViews";
import { openTestDatabase } from "./testDb";

describe("repositories", () => {
  it("persists member language preference across reopen of the same connection", () => {
    const db = openTestDatabase();
    const preferences = new MemberPreferenceRepository(db);
    preferences.set({
      guildId: "g1",
      userId: "u1",
      preferredLanguage: "id",
    });

    expect(preferences.get("g1", "u1")?.preferredLanguage).toBe("id");
    db.close();
  });

  it("creates a logical message and original copy in one transaction without storing text", () => {
    const db = openTestDatabase();
    const rooms = new LogicalRoomRepository(db);
    const views = new RoomViewRepository(db);
    const messages = new LogicalMessageRepository(db);
    const copies = new MessageCopyRepository(db);
    const jobs = new PendingJobRepository(db);

    const room = rooms.create({
      id: randomUUID(),
      guildId: "g1",
      slug: "general",
      displayName: "general",
    });
    const view = views.create({
      id: randomUUID(),
      roomId: room.id,
      languageCode: "zh",
      channelId: "c-zh",
    });

    const logical = db.transaction(() => {
      const created = messages.create({
        id: randomUUID(),
        roomId: room.id,
        sourceMessageId: "m1",
        sourceChannelId: view.channelId,
        sourceViewId: view.id,
        authorUserId: "u1",
        detectedSourceLanguage: "zh",
        detectionConfidence: 0.9,
      });
      copies.upsert({
        logicalMessageId: created.id,
        viewId: view.id,
        languageCode: "zh",
        discordMessageId: "m1",
        channelId: view.channelId,
        isOriginal: true,
        revision: 1,
      });
      jobs.enqueue({
        id: randomUUID(),
        logicalMessageId: created.id,
        targetViewId: view.id,
        revision: 1,
      });
      return created;
    });

    expect(logical.sourceMessageId).toBe("m1");
    expect(copies.get(logical.id, view.id)?.isOriginal).toBe(true);
    expect(
      jobs.getByTriple(logical.id, view.id, 1)?.status,
    ).toBe("queued");
    expect(JSON.stringify(logical)).not.toMatch(/今晚/);
    db.close();
  });

  it("bumps revisions, cancels stale jobs, and marks logical messages deleted", () => {
    const db = openTestDatabase();
    const rooms = new LogicalRoomRepository(db);
    const views = new RoomViewRepository(db);
    const messages = new LogicalMessageRepository(db);
    const copies = new MessageCopyRepository(db);
    const jobs = new PendingJobRepository(db);

    const room = rooms.create({
      id: randomUUID(),
      guildId: "g1",
      slug: "general",
      displayName: "general",
    });
    const view = views.create({
      id: randomUUID(),
      roomId: room.id,
      languageCode: "zh",
      channelId: "c-zh",
    });
    const logical = messages.create({
      id: randomUUID(),
      roomId: room.id,
      sourceMessageId: "m1",
      sourceChannelId: view.channelId,
      sourceViewId: view.id,
      authorUserId: "u1",
      detectedSourceLanguage: "zh",
      detectionConfidence: 0.9,
    });
    copies.upsert({
      logicalMessageId: logical.id,
      viewId: view.id,
      languageCode: "zh",
      discordMessageId: "m1",
      channelId: view.channelId,
      isOriginal: true,
      revision: 1,
    });
    jobs.enqueue({
      id: randomUUID(),
      logicalMessageId: logical.id,
      targetViewId: view.id,
      revision: 1,
    });

    messages.updateDetection(logical.id, "en", 0.8);
    const bumped = messages.bumpRevision(logical.id);
    expect(bumped.revision).toBe(2);
    expect(bumped.detectedSourceLanguage).toBe("en");
    expect(jobs.cancelStale(logical.id, bumped.revision)).toBe(1);
    expect(jobs.getByTriple(logical.id, view.id, 1)?.status).toBe("cancelled");

    messages.markDeleted(logical.id);
    expect(messages.get(logical.id)?.deletedAt).toBeTruthy();
    expect(copies.listByLogicalMessage(logical.id)).toHaveLength(1);
    db.close();
  });
});
