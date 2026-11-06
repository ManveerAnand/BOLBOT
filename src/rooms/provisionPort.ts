export interface ChannelOverwrite {
  id: string;
  allow: bigint;
  deny: bigint;
}

export interface GuildProvisionPort {
  readonly guildId: string;
  readonly everyoneId: string;
  readonly botId: string;
  findCategory(id: string): { id: string } | undefined;
  findCategoryByName(name: string): { id: string } | undefined;
  createCategory(
    name: string,
    overwrites: ChannelOverwrite[],
  ): Promise<{ id: string }>;
  syncOverwrites(
    channelId: string,
    overwrites: ChannelOverwrite[],
  ): Promise<void>;
  findTextChannel(id: string): { id: string; name: string } | undefined;
  findTextChannelByName(
    name: string,
    parentId: string | undefined,
  ): { id: string } | undefined;
  createTextChannel(input: {
    name: string;
    parentId: string | undefined;
    topic: string;
    overwrites: ChannelOverwrite[];
  }): Promise<{ id: string }>;
  setChannelTopic(channelId: string, topic: string): Promise<void>;
  findWebhook(
    channelId: string,
    webhookId: string,
  ): Promise<{ id: string } | undefined>;
  createWebhook(
    channelId: string,
    name: string,
  ): Promise<{ id: string; token: string }>;
  refresh?(): Promise<void>;
}
