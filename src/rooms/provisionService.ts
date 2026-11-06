import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../database/db.js";
import { EnabledLanguageRepository } from "../database/repositories/enabledLanguages.js";
import { LogicalRoomRepository } from "../database/repositories/logicalRooms.js";
import { RoomViewRepository } from "../database/repositories/roomViews.js";
import type { LogicalRoom, RoomView } from "../database/types.js";
import { LanguagePreferenceError, ensureTranslatorRole } from "../language/preference.js";
import {
  requireSupportedLanguage,
  resolveLanguageChoice,
  type SupportedLanguage,
} from "../language/registry.js";
import { encryptSecret } from "../security/webhookCrypto.js";
import type { TranslatorRolePort } from "../discord/roles/translatorRoles.js";
import {
  isValidRoomSlug,
  normalizeRoomSlug,
  roomCategoryName,
  viewChannelName,
  viewChannelTopic,
  viewWebhookName,
} from "./names.js";
import {
  languageChannelOverwrites,
  roomCategoryOverwrites,
} from "./permissions.js";
import type { GuildProvisionPort } from "./provisionPort.js";

export class RoomProvisionError extends Error {
  constructor(
    readonly code:
      | "invalid_slug"
      | "no_languages"
      | "unsupported"
      | "language_cap",
    message: string,
  ) {
    super(message);
    this.name = "RoomProvisionError";
  }
}

export interface ProvisionReport {
  room: LogicalRoom;
  createdViews: number;
  repaired: string[];
  failures: string[];
}

export async function createLogicalRoom(input: {
  db: AppDatabase;
  guild: GuildProvisionPort;
  webhookKey: Buffer;
  name: string;
}): Promise<ProvisionReport> {
  const slug = normalizeRoomSlug(input.name);
  if (!isValidRoomSlug(slug)) {
    throw new RoomProvisionError(
      "invalid_slug",
      "Use a short name like general. Letters, numbers, and hyphens only.",
    );
  }

  const languages = new EnabledLanguageRepository(input.db);
  await input.guild.refresh?.();
  const enabled = languages.listEnabled(input.guild.guildId);
  if (enabled.length === 0) {
    throw new RoomProvisionError(
      "no_languages",
      "Enable a language with /language set first, then create the room.",
    );
  }

  const rooms = new LogicalRoomRepository(input.db);
  const existing = rooms.getBySlug(input.guild.guildId, slug);
  const room =
    existing ??
    rooms.create({
      id: randomUUID(),
      guildId: input.guild.guildId,
      slug,
      displayName: slug,
      status: "provisioning",
    });

  return provisionRoomViews({
    db: input.db,
    guild: input.guild,
    webhookKey: input.webhookKey,
    room,
    languageCodes: enabled.map((row) => row.languageCode),
  });
}

export async function provisionLanguageViews(input: {
  db: AppDatabase;
  guild: GuildProvisionPort;
  webhookKey: Buffer;
  languageCode: string;
}): Promise<ProvisionReport[]> {
  await input.guild.refresh?.();
  const rooms = new LogicalRoomRepository(input.db).list(input.guild.guildId);
  const reports: ProvisionReport[] = [];
  for (const room of rooms) {
    reports.push(
      await provisionRoomViews({
        db: input.db,
        guild: input.guild,
        webhookKey: input.webhookKey,
        room,
        languageCodes: [input.languageCode],
      }),
    );
  }
  return reports;
}

export async function enableTranslatorLanguage(input: {
  db: AppDatabase;
  roles: TranslatorRolePort;
  guild: GuildProvisionPort;
  webhookKey: Buffer;
  languageInput: string;
  maxEnabledLanguages: number;
}): Promise<{ language: SupportedLanguage; reports: ProvisionReport[] }> {
  const language = resolveLanguageChoice(input.languageInput);
  if (!language) {
    throw new RoomProvisionError(
      "unsupported",
      "I don't support that language. Use /language list.",
    );
  }

  const languages = new EnabledLanguageRepository(input.db);
  const existing = languages.get(input.guild.guildId, language.internalCode);
  if (
    !existing?.enabled &&
    languages.listEnabled(input.guild.guildId).length >=
      input.maxEnabledLanguages
  ) {
    throw new RoomProvisionError(
      "language_cap",
      `This server already has ${input.maxEnabledLanguages} languages enabled.`,
    );
  }

  await input.roles.refreshRoles?.();
  await ensureTranslatorRole(
    languages,
    input.roles,
    input.guild.guildId,
    language,
  );

  const reports = await provisionLanguageViews({
    db: input.db,
    guild: input.guild,
    webhookKey: input.webhookKey,
    languageCode: language.internalCode,
  });
  return { language, reports };
}

export function disableTranslatorLanguage(input: {
  db: AppDatabase;
  guildId: string;
  languageInput: string;
}): SupportedLanguage {
  const language = resolveLanguageChoice(input.languageInput);
  if (!language) {
    throw new RoomProvisionError(
      "unsupported",
      "I don't support that language. Use /language list.",
    );
  }
  const languages = new EnabledLanguageRepository(input.db);
  const existing = languages.get(input.guildId, language.internalCode);
  if (!existing) {
    throw new LanguagePreferenceError(
      "unsupported",
      `${language.displayName} is not enabled.`,
    );
  }
  languages.upsert({
    guildId: input.guildId,
    languageCode: language.internalCode,
    roleId: existing.roleId,
    enabled: false,
  });
  return language;
}

export async function reconcileGuildRooms(input: {
  db: AppDatabase;
  guild: GuildProvisionPort;
  webhookKey: Buffer;
}): Promise<ProvisionReport[]> {
  const languages = new EnabledLanguageRepository(input.db).listEnabled(
    input.guild.guildId,
  );
  await input.guild.refresh?.();
  const rooms = new LogicalRoomRepository(input.db).list(input.guild.guildId);
  const reports: ProvisionReport[] = [];
  for (const room of rooms) {
    reports.push(
      await provisionRoomViews({
        db: input.db,
        guild: input.guild,
        webhookKey: input.webhookKey,
        room,
        languageCodes: languages.map((row) => row.languageCode),
      }),
    );
  }
  return reports;
}

export function formatRoomList(input: {
  rooms: LogicalRoom[];
  viewsByRoom: Map<string, RoomView[]>;
}): string {
  if (input.rooms.length === 0) {
    return "No translator rooms yet. An admin can run /translator room-create general.";
  }

  const blocks = input.rooms.map((room) => {
    const views = input.viewsByRoom.get(room.id) ?? [];
    const lines = views.map((view) => {
      const webhook = view.webhookId ? "webhook ok" : "webhook missing";
      return `  ${view.languageCode} → <#${view.channelId}> (${webhook})`;
    });
    return [`${room.slug} [${room.status}]`, ...lines].join("\n");
  });
  return ["Translator rooms:", "", ...blocks].join("\n");
}

export function formatProvisionReport(report: ProvisionReport): string {
  const lines = [
    `Room ${report.room.slug} [${report.room.status}]`,
    `Views ready: ${report.createdViews} created or repaired in this run.`,
  ];
  if (report.repaired.length > 0) {
    lines.push(`Repaired: ${report.repaired.join("; ")}`);
  }
  if (report.failures.length > 0) {
    lines.push(`Needs attention: ${report.failures.join("; ")}`);
    lines.push("Run /translator reconcile after fixing Discord permissions.");
  }
  return lines.join("\n");
}

async function provisionRoomViews(input: {
  db: AppDatabase;
  guild: GuildProvisionPort;
  webhookKey: Buffer;
  room: LogicalRoom;
  languageCodes: string[];
}): Promise<ProvisionReport> {
  const rooms = new LogicalRoomRepository(input.db);
  const views = new RoomViewRepository(input.db);
  const languages = new EnabledLanguageRepository(input.db);
  const repaired: string[] = [];
  const failures: string[] = [];
  let createdViews = 0;

  rooms.update(input.room.id, { status: "provisioning" });

  const enabledRows = languages
    .listEnabled(input.guild.guildId)
    .filter((row) => input.languageCodes.includes(row.languageCode));
  const roleIds = enabledRows.map((row) => row.roleId);

  try {
    const category = await ensureCategory(
      input.guild,
      input.room,
      roleIds,
      repaired,
    );
    rooms.update(input.room.id, { categoryId: category.id });

    for (const code of input.languageCodes) {
      const language = requireSupportedLanguage(code);
      const enabled = languages.get(input.guild.guildId, code);
      if (!enabled) {
        failures.push(`${code}: language is not enabled`);
        continue;
      }
      try {
        const before = views.getByRoomLanguage(input.room.id, code);
        const view = await ensureLanguageView({
          guild: input.guild,
          webhookKey: input.webhookKey,
          views,
          room: { ...input.room, categoryId: category.id },
          language,
          languageRoleId: enabled.roleId,
        });
        if (
          !before ||
          before.channelId !== view.channelId ||
          before.webhookId !== view.webhookId
        ) {
          createdViews += 1;
          repaired.push(`${input.room.slug}-${code}`);
        }
      } catch (error) {
        failures.push(
          `${code}: ${error instanceof Error ? error.name : "unknown"}`,
        );
      }
    }

    const status =
      failures.length > 0 ? "provisioning_failed" : "active";
    const updated = rooms.update(input.room.id, { status });
    return {
      room: updated,
      createdViews,
      repaired,
      failures,
    };
  } catch (error) {
    const updated = rooms.update(input.room.id, {
      status: "provisioning_failed",
    });
    failures.push(error instanceof Error ? error.name : "unknown");
    return {
      room: updated,
      createdViews,
      repaired,
      failures,
    };
  }
}

async function ensureCategory(
  guild: GuildProvisionPort,
  room: LogicalRoom,
  languageRoleIds: string[],
  repaired: string[],
): Promise<{ id: string }> {
  const name = roomCategoryName(room.slug);
  const overwrites = roomCategoryOverwrites({
    everyoneId: guild.everyoneId,
    languageRoleIds,
    botId: guild.botId,
  });
  const existing =
    (room.categoryId ? guild.findCategory(room.categoryId) : undefined) ??
    guild.findCategoryByName(name);
  if (existing) {
    await guild.syncOverwrites(existing.id, overwrites);
    return existing;
  }
  repaired.push(`category ${name}`);
  return guild.createCategory(name, overwrites);
}

async function ensureLanguageView(input: {
  guild: GuildProvisionPort;
  webhookKey: Buffer;
  views: RoomViewRepository;
  room: LogicalRoom;
  language: SupportedLanguage;
  languageRoleId: string;
}): Promise<RoomView> {
  const channelName = viewChannelName(
    input.room.slug,
    input.language.internalCode,
  );
  const overwrites = languageChannelOverwrites({
    everyoneId: input.guild.everyoneId,
    languageRoleId: input.languageRoleId,
    botId: input.guild.botId,
  });
  const stored = input.views.getByRoomLanguage(
    input.room.id,
    input.language.internalCode,
  );
  const existingChannel =
    (stored ? input.guild.findTextChannel(stored.channelId) : undefined) ??
    input.guild.findTextChannelByName(
      channelName,
      input.room.categoryId ?? undefined,
    );

  const channel =
    existingChannel ??
    (await input.guild.createTextChannel({
      name: channelName,
      parentId: input.room.categoryId ?? undefined,
      topic: viewChannelTopic(input.room.displayName, input.language),
      overwrites,
    }));

  await input.guild.syncOverwrites(channel.id, overwrites);
  await input.guild.setChannelTopic(
    channel.id,
    viewChannelTopic(input.room.displayName, input.language),
  );

  let webhookId = stored?.webhookId ?? null;
  let ciphertext = stored?.webhookTokenCiphertext ?? null;
  const webhookStillThere =
    webhookId !== null
      ? await input.guild.findWebhook(channel.id, webhookId)
      : undefined;
  if (!webhookStillThere || !ciphertext) {
    const webhook = await input.guild.createWebhook(
      channel.id,
      viewWebhookName(input.room.slug, input.language.internalCode),
    );
    webhookId = webhook.id;
    ciphertext = encryptSecret(webhook.token, input.webhookKey);
  }

  if (stored) {
    return input.views.update(stored.id, {
      channelId: channel.id,
      webhookId,
      webhookTokenCiphertext: ciphertext,
      enabled: true,
    });
  }

  return input.views.create({
    id: randomUUID(),
    roomId: input.room.id,
    languageCode: input.language.internalCode,
    channelId: channel.id,
    webhookId,
    webhookTokenCiphertext: ciphertext,
    enabled: true,
  });
}
