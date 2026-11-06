import { describe, expect, it } from "vitest";
import { EnabledLanguageRepository } from "../../../src/database/repositories/enabledLanguages";
import { RoomViewRepository } from "../../../src/database/repositories/roomViews";
import {
  createLogicalRoom,
  formatRoomList,
  reconcileGuildRooms,
  RoomProvisionError,
} from "../../../src/rooms/provisionService";
import type {
  ChannelOverwrite,
  GuildProvisionPort,
} from "../../../src/rooms/provisionPort";
import { decryptSecret } from "../../../src/security/webhookCrypto";
import { openTestDatabase } from "../database/testDb";

class FakeGuildPort implements GuildProvisionPort {
  readonly guildId = "g1";
  readonly everyoneId = "g1";
  readonly botId = "bot-role";
  readonly categories = new Map<string, { id: string; name: string }>();
  readonly channels = new Map<
    string,
    { id: string; name: string; parentId?: string; topic?: string }
  >();
  readonly webhooks = new Map<string, { id: string; token: string }>();
  deletedWebhook = false;
  private nextId = 1;

  findCategory(id: string) {
    return this.categories.get(id);
  }

  findCategoryByName(name: string) {
    return [...this.categories.values()].find((item) => item.name === name);
  }

  async createCategory(name: string, _overwrites: ChannelOverwrite[]) {
    const item = { id: `cat-${this.nextId}`, name };
    this.nextId += 1;
    this.categories.set(item.id, item);
    return item;
  }

  async syncOverwrites() {}

  findTextChannel(id: string) {
    return this.channels.get(id);
  }

  findTextChannelByName(name: string, parentId: string | undefined) {
    return [...this.channels.values()].find(
      (item) =>
        item.name === name &&
        (parentId === undefined || item.parentId === parentId),
    );
  }

  async createTextChannel(input: {
    name: string;
    parentId: string | undefined;
    topic: string;
    overwrites: ChannelOverwrite[];
  }) {
    const item = {
      id: `ch-${this.nextId}`,
      name: input.name,
      parentId: input.parentId,
      topic: input.topic,
    };
    this.nextId += 1;
    this.channels.set(item.id, item);
    return item;
  }

  async setChannelTopic(channelId: string, topic: string) {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.topic = topic;
    }
  }

  async findWebhook(channelId: string, webhookId: string) {
    const webhook = this.webhooks.get(channelId);
    return webhook?.id === webhookId ? { id: webhookId } : undefined;
  }

  async createWebhook(channelId: string, _name: string) {
    const webhook = {
      id: `wh-${this.nextId}`,
      token: "plain-webhook-token",
    };
    this.nextId += 1;
    this.webhooks.set(channelId, webhook);
    return webhook;
  }
}

describe("provisionService", () => {
  it("creates language views and encrypts webhook tokens", async () => {
    const db = openTestDatabase();
    const languages = new EnabledLanguageRepository(db);
    languages.upsert({
      guildId: "g1",
      languageCode: "en",
      roleId: "role-en",
      enabled: true,
    });
    languages.upsert({
      guildId: "g1",
      languageCode: "zh",
      roleId: "role-zh",
      enabled: true,
    });

    const guild = new FakeGuildPort();
    const key = Buffer.alloc(32, 3);
    const report = await createLogicalRoom({
      db,
      guild,
      webhookKey: key,
      name: "general",
    });

    const views = new RoomViewRepository(db).listByRoom(report.room.id);
    expect(report.room.status).toBe("active");
    expect(views.map((view) => view.languageCode)).toEqual(["en", "zh"]);
    expect(guild.channels.size).toBe(2);
    for (const view of views) {
      expect(view.webhookTokenCiphertext).toBeTruthy();
      expect(view.webhookTokenCiphertext).not.toContain("plain-webhook-token");
      expect(
        decryptSecret(view.webhookTokenCiphertext!, key),
      ).toBe("plain-webhook-token");
    }
    expect(JSON.stringify(views)).not.toContain("plain-webhook-token");
    expect(
      formatRoomList({
        rooms: [report.room],
        viewsByRoom: new Map([[report.room.id, views]]),
      }),
    ).toContain("general [active]");
    db.close();
  });

  it("repairs a missing webhook on reconcile", async () => {
    const db = openTestDatabase();
    new EnabledLanguageRepository(db).upsert({
      guildId: "g1",
      languageCode: "en",
      roleId: "role-en",
      enabled: true,
    });
    const guild = new FakeGuildPort();
    const key = Buffer.alloc(32, 3);
    const created = await createLogicalRoom({
      db,
      guild,
      webhookKey: key,
      name: "general",
    });
    const view = new RoomViewRepository(db).listByRoom(created.room.id)[0]!;
    guild.webhooks.delete(view.channelId);

    const [report] = await reconcileGuildRooms({
      db,
      guild,
      webhookKey: key,
    });
    expect(report?.repaired.some((item) => item.includes("general-en"))).toBe(
      true,
    );
    const repaired = new RoomViewRepository(db).get(view.id);
    expect(repaired?.webhookId).not.toBe(view.webhookId);
    db.close();
  });

  it("rejects room create before any language is enabled", async () => {
    const db = openTestDatabase();
    await expect(
      createLogicalRoom({
        db,
        guild: new FakeGuildPort(),
        webhookKey: Buffer.alloc(32, 3),
        name: "general",
      }),
    ).rejects.toBeInstanceOf(RoomProvisionError);
    db.close();
  });
});
