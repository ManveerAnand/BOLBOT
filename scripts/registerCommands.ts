import { loadEnv, requireDiscordEnv } from "../src/config/env.js";
import { registerGuildCommands } from "../src/discord/commands/register.js";
import { createLogger } from "../src/observability/logger.js";

const env = requireDiscordEnv(loadEnv());
const logger = createLogger(env);

await registerGuildCommands(env);
logger.info({ event: "commands_registered", guildId: env.DISCORD_GUILD_ID });
