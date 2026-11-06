import { Events, type Client } from "discord.js";
import type { DiscordEnv } from "../../config/env.js";
import type { AppLogger } from "../../observability/logger.js";

export function attachReadyHandler(
  client: Client,
  logger: AppLogger,
  env: DiscordEnv,
): void {
  client.once(Events.ClientReady, () => {
    logger.info(
      {
        event: "discord_ready",
        guildId: env.DISCORD_GUILD_ID,
        userId: client.user?.id,
      },
      "discord connected",
    );
  });
}
