import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
} from "discord.js";
import {
  BOT_JOIN_WELCOME_WINDOW_MS,
  LANGUAGE_SET_CUSTOM_ID_PREFIX,
} from "../../config/constants.js";
import type { AppDatabase } from "../../database/db.js";
import { EnabledLanguageRepository } from "../../database/repositories/enabledLanguages.js";
import { resolveSupportedLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../language/registry.js";

export function formatWelcomeMessage(): string {
  return [
    "**Choose your language**",
    "",
    "This server has a channel for each language. Pick the language you want to read and write. That adds you to that group so you can see those channels.",
    "",
    "Use the buttons below, or type `/language set`.",
    "You can change this later the same way.",
  ].join("\n");
}

export function languageSelectCustomId(languageCode: string): string {
  return `${LANGUAGE_SET_CUSTOM_ID_PREFIX}${languageCode}`;
}

export function parseLanguageSelectCustomId(
  customId: string,
): string | null {
  if (!customId.startsWith(LANGUAGE_SET_CUSTOM_ID_PREFIX)) {
    return null;
  }
  const code = customId.slice(LANGUAGE_SET_CUSTOM_ID_PREFIX.length);
  return resolveSupportedLanguage(code)?.internalCode ?? null;
}

export function languagesForWelcome(
  db: AppDatabase,
  guildId: string,
): SupportedLanguage[] {
  const enabled = new EnabledLanguageRepository(db)
    .listEnabled(guildId)
    .map((row) => resolveSupportedLanguage(row.languageCode))
    .filter((language): language is SupportedLanguage => language !== undefined);
  if (enabled.length > 0) {
    return enabled;
  }
  return SUPPORTED_LANGUAGES.filter((language) => language.enabledByDefault);
}

export function languageSelectRows(
  languages: readonly SupportedLanguage[],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < languages.length && rows.length < 5; index += 5) {
    const chunk = languages.slice(index, index + 5);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((language) =>
          new ButtonBuilder()
            .setCustomId(languageSelectCustomId(language.internalCode))
            .setLabel(welcomeButtonLabel(language))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function shouldPostWelcomeOnJoin(input: {
  joinedAt: Date | null | undefined;
  alreadyPosted: boolean;
  now?: number;
}): boolean {
  if (input.alreadyPosted || !input.joinedAt) {
    return false;
  }
  const now = input.now ?? Date.now();
  return now - input.joinedAt.getTime() <= BOT_JOIN_WELCOME_WINDOW_MS;
}

export function findWelcomeChannel(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  if (!me) {
    return null;
  }
  if (
    guild.systemChannel &&
    canPostWelcome(me, guild.systemChannel)
  ) {
    return guild.systemChannel;
  }
  const fallback = guild.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText && canPostWelcome(me, channel),
  );
  return fallback ?? null;
}

function welcomeButtonLabel(language: SupportedLanguage): string {
  const label =
    language.nativeName === language.displayName
      ? language.displayName
      : `${language.displayName} · ${language.nativeName}`;
  return label.slice(0, 80);
}

function canPostWelcome(
  me: NonNullable<Guild["members"]["me"]>,
  channel: GuildBasedChannel,
): boolean {
  if (!channel.isTextBased() || channel.isDMBased() || channel.isThread()) {
    return false;
  }
  return Boolean(
    channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
  );
}
