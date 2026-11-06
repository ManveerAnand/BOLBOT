import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
} from "discord.js";
import type {
  ChannelOverwrite,
  GuildProvisionPort,
} from "../../rooms/provisionPort.js";

export class DiscordGuildProvisionPort implements GuildProvisionPort {
  readonly guildId: string;
  readonly everyoneId: string;
  readonly botId: string;

  constructor(private readonly guild: Guild) {
    this.guildId = guild.id;
    this.everyoneId = guild.id;
    const me = guild.members.me;
    const botRole = me ? guild.roles.botRoleFor(me) : null;
    this.botId = botRole?.id ?? me?.id ?? guild.client.user.id;
  }

  findCategory(id: string): { id: string } | undefined {
    const channel = this.guild.channels.cache.get(id);
    return isCategory(channel) ? { id: channel.id } : undefined;
  }

  findCategoryByName(name: string): { id: string } | undefined {
    const channel = this.guild.channels.cache.find(
      (item) => isCategory(item) && item.name === name,
    );
    return channel ? { id: channel.id } : undefined;
  }

  async createCategory(
    name: string,
    overwrites: ChannelOverwrite[],
  ): Promise<{ id: string }> {
    const channel = await this.guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: toOverwriteData(overwrites),
      reason: "Managed translator room",
    });
    return { id: channel.id };
  }

  async syncOverwrites(
    channelId: string,
    overwrites: ChannelOverwrite[],
  ): Promise<void> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!channel || !("permissionOverwrites" in channel)) {
      throw Object.assign(new Error("missing_channel"), {
        name: "MissingChannel",
      });
    }
    await channel.permissionOverwrites.set(toOverwriteData(overwrites));
  }

  findTextChannel(id: string): { id: string; name: string } | undefined {
    const channel = this.guild.channels.cache.get(id);
    return isGuildText(channel)
      ? { id: channel.id, name: channel.name }
      : undefined;
  }

  findTextChannelByName(
    name: string,
    parentId: string | undefined,
  ): { id: string } | undefined {
    const channel = this.guild.channels.cache.find(
      (item) =>
        isGuildText(item) &&
        item.name === name &&
        (parentId === undefined || item.parentId === parentId),
    );
    return channel ? { id: channel.id } : undefined;
  }

  async createTextChannel(input: {
    name: string;
    parentId: string | undefined;
    topic: string;
    overwrites: ChannelOverwrite[];
  }): Promise<{ id: string }> {
    const channel = await this.guild.channels.create({
      name: input.name,
      type: ChannelType.GuildText,
      topic: input.topic,
      permissionOverwrites: toOverwriteData(input.overwrites),
      reason: "Managed translator language view",
      ...(input.parentId ? { parent: input.parentId } : {}),
    });
    return { id: channel.id };
  }

  async setChannelTopic(channelId: string, topic: string): Promise<void> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!isGuildText(channel)) {
      throw Object.assign(new Error("missing_text_channel"), {
        name: "MissingTextChannel",
      });
    }
    await channel.setTopic(topic);
  }

  async findWebhook(
    channelId: string,
    webhookId: string,
  ): Promise<{ id: string } | undefined> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!isGuildText(channel)) {
      return undefined;
    }
    const webhooks = await channel.fetchWebhooks();
    return webhooks.has(webhookId) ? { id: webhookId } : undefined;
  }

  async createWebhook(
    channelId: string,
    name: string,
  ): Promise<{ id: string; token: string }> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!isGuildText(channel)) {
      throw Object.assign(new Error("missing_text_channel"), {
        name: "MissingTextChannel",
      });
    }
    const webhook = await channel.createWebhook({
      name,
      reason: "Managed translator webhook",
    });
    if (!webhook.token) {
      throw Object.assign(new Error("missing_webhook_token"), {
        name: "MissingWebhookToken",
      });
    }
    return { id: webhook.id, token: webhook.token };
  }

  async refresh(): Promise<void> {
    await this.guild.channels.fetch();
  }
}

function isCategory(
  channel: GuildBasedChannel | undefined,
): channel is Extract<GuildBasedChannel, { type: ChannelType.GuildCategory }> {
  return channel?.type === ChannelType.GuildCategory;
}

function isGuildText(
  channel: GuildBasedChannel | undefined,
): channel is Extract<GuildBasedChannel, { type: ChannelType.GuildText }> {
  return channel?.type === ChannelType.GuildText;
}

function toOverwriteData(overwrites: ChannelOverwrite[]) {
  return overwrites.map((overwrite) => ({
    id: overwrite.id,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}
