import type { Guild } from "discord.js";
import type { DiscordEnv } from "../../config/env.js";
import type { AppDatabase } from "../../database/db.js";
import { GuildWelcomeRepository } from "../../database/repositories/guildWelcome.js";
import { RoomViewRepository } from "../../database/repositories/roomViews.js";
import type { AppLogger } from "../../observability/logger.js";
import { publishWelcomeMessage } from "../onboarding/publishWelcome.js";
import {
  findWelcomeChannel,
  languagesForWelcome,
  shouldPostWelcomeOnJoin,
} from "../onboarding/welcome.js";

export async function handleGuildCreate(
  guild: Guild,
  context: {
    env: DiscordEnv;
    db: AppDatabase;
    logger: AppLogger;
  },
): Promise<void> {
  if (guild.id !== context.env.DISCORD_GUILD_ID) {
    return;
  }

  const alreadyPosted = Boolean(
    new GuildWelcomeRepository(context.db).get(guild.id),
  );
  if (
    !shouldPostWelcomeOnJoin({
      joinedAt: guild.members.me?.joinedAt,
      alreadyPosted,
    })
  ) {
    return;
  }

  const channel = findWelcomeChannel(guild);
  if (!channel || new RoomViewRepository(context.db).getByChannelId(channel.id)) {
    context.logger.warn({
      event: "welcome_channel_missing",
      guildId: guild.id,
    });
    return;
  }

  try {
    const posted = await publishWelcomeMessage({
      db: context.db,
      channel,
      languages: languagesForWelcome(context.db, guild.id),
    });
    context.logger.info({
      event: "welcome_posted",
      guildId: guild.id,
      channelId: posted.channelId,
    });
  } catch {
    context.logger.warn({
      event: "welcome_post_failed",
      guildId: guild.id,
    });
  }
}
