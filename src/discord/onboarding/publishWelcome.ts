import type { GuildTextBasedChannel } from "discord.js";
import type { AppDatabase } from "../../database/db.js";
import { GuildWelcomeRepository } from "../../database/repositories/guildWelcome.js";
import type { SupportedLanguage } from "../../language/registry.js";
import { formatWelcomeMessage, languageSelectRows } from "./welcome.js";

export async function publishWelcomeMessage(input: {
  db: AppDatabase;
  channel: GuildTextBasedChannel;
  languages: readonly SupportedLanguage[];
}): Promise<{ channelId: string; messageId: string }> {
  const payload = {
    content: formatWelcomeMessage(),
    components: languageSelectRows(input.languages),
    allowedMentions: { parse: [] as const },
  };
  const sent = await input.channel.send(payload);
  new GuildWelcomeRepository(input.db).upsert({
    guildId: input.channel.guild.id,
    channelId: input.channel.id,
    messageId: sent.id,
  });
  return { channelId: sent.channel.id, messageId: sent.id };
}
