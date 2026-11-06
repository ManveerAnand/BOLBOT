import { REST, Routes } from "discord.js";
import type { DiscordEnv } from "../../config/env.js";
import { languageCommand } from "./language.js";
import { translatorCommand } from "./translator.js";

export function commandBuilders() {
  return [translatorCommand(), languageCommand()];
}

export async function registerGuildCommands(env: DiscordEnv): Promise<void> {
  const rest = new REST({ version: "10", timeout: 15_000 }).setToken(
    env.DISCORD_BOT_TOKEN,
  );
  await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
    { body: commandBuilders().map((command) => command.toJSON()) },
  );
}
