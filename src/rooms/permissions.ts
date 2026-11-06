import { PermissionFlagsBits } from "discord.js";
import type { ChannelOverwrite } from "./provisionPort.js";

export function languageChannelOverwrites(input: {
  everyoneId: string;
  languageRoleId: string;
  botId: string;
}): ChannelOverwrite[] {
  return [
    {
      id: input.everyoneId,
      allow: 0n,
      deny: PermissionFlagsBits.ViewChannel,
    },
    {
      id: input.languageRoleId,
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory,
      deny: 0n,
    },
    {
      id: input.botId,
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.ManageWebhooks,
      deny: 0n,
    },
  ];
}

export function roomCategoryOverwrites(input: {
  everyoneId: string;
  languageRoleIds: string[];
  botId: string;
}): ChannelOverwrite[] {
  return [
    {
      id: input.everyoneId,
      allow: 0n,
      deny: PermissionFlagsBits.ViewChannel,
    },
    ...input.languageRoleIds.map((roleId) => ({
      id: roleId,
      allow: PermissionFlagsBits.ViewChannel,
      deny: 0n,
    })),
    {
      id: input.botId,
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.ManageChannels |
        PermissionFlagsBits.ManageWebhooks,
      deny: 0n,
    },
  ];
}
