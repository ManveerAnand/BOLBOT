import {
  PermissionsBitField,
  type GuildMember,
} from "discord.js";
import type {
  TranslatorRole,
  TranslatorRolePort,
} from "./translatorRoles.js";

export class DiscordGuildMemberRolePort implements TranslatorRolePort {
  constructor(private readonly member: GuildMember) {}

  async refreshRoles(): Promise<void> {
    await this.member.guild.roles.fetch();
  }

  findRole(roleId: string): TranslatorRole | undefined {
    const role = this.member.guild.roles.cache.get(roleId);
    return role ? { id: role.id, name: role.name } : undefined;
  }

  findRoleByName(name: string): TranslatorRole | undefined {
    const role = this.member.guild.roles.cache.find((item) => item.name === name);
    return role ? { id: role.id, name: role.name } : undefined;
  }

  async createRole(name: string): Promise<TranslatorRole> {
    const role = await this.member.guild.roles.create({
      name,
      hoist: false,
      mentionable: false,
      permissions: new PermissionsBitField(0n),
      reason: "Managed translator language role",
    });
    return { id: role.id, name: role.name };
  }

  memberRoleIds(): string[] {
    return [...this.member.roles.cache.keys()];
  }

  async addMemberRole(roleId: string): Promise<void> {
    if (this.member.roles.cache.has(roleId)) {
      return;
    }
    await this.member.roles.add(roleId, "Translator language preference");
  }

  async removeMemberRole(roleId: string): Promise<void> {
    if (!this.member.roles.cache.has(roleId)) {
      return;
    }
    await this.member.roles.remove(roleId, "Translator language preference");
  }
}
