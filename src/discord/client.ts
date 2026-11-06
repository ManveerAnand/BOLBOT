import { Client, Partials } from "discord.js";
import { BOT_INTENTS } from "./intents.js";

export function createDiscordClient(): Client {
  return new Client({
    intents: [...BOT_INTENTS],
    partials: [Partials.Channel, Partials.Message],
  });
}
