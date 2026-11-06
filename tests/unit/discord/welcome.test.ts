import { describe, expect, it } from "vitest";
import { LANGUAGE_SET_CUSTOM_ID_PREFIX } from "../../../src/config/constants";
import { EnabledLanguageRepository } from "../../../src/database/repositories/enabledLanguages";
import { GuildWelcomeRepository } from "../../../src/database/repositories/guildWelcome";
import { publishWelcomeMessage } from "../../../src/discord/onboarding/publishWelcome";
import {
  formatWelcomeMessage,
  languageSelectCustomId,
  languageSelectRows,
  languagesForWelcome,
  parseLanguageSelectCustomId,
  shouldPostWelcomeOnJoin,
} from "../../../src/discord/onboarding/welcome";
import { openTestDatabase } from "../database/testDb";

describe("welcome onboarding", () => {
  it("explains self-registration without logging or storing chat text", () => {
    const message = formatWelcomeMessage();
    expect(message).toContain("/language set");
    expect(message).toMatch(/button/i);
    expect(message).toMatch(/group|channel/i);
  });

  it("parses language button custom ids", () => {
    expect(languageSelectCustomId("zh")).toBe(
      `${LANGUAGE_SET_CUSTOM_ID_PREFIX}zh`,
    );
    expect(parseLanguageSelectCustomId("lang:set:zh")).toBe("zh");
    expect(parseLanguageSelectCustomId("lang:set:nope")).toBeNull();
    expect(parseLanguageSelectCustomId("other:en")).toBeNull();
  });

  it("uses enabled languages when present, otherwise the default set", () => {
    const db = openTestDatabase();
    expect(
      languagesForWelcome(db, "g1").map((language) => language.internalCode),
    ).toEqual(["en", "zh", "id", "ja"]);

    new EnabledLanguageRepository(db).upsert({
      guildId: "g1",
      languageCode: "zh",
      roleId: "role-zh",
      enabled: true,
    });
    expect(
      languagesForWelcome(db, "g1").map((language) => language.internalCode),
    ).toEqual(["zh"]);
    db.close();
  });

  it("builds one button row per five languages", () => {
    const db = openTestDatabase();
    const rows = languageSelectRows(languagesForWelcome(db, "g1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.components).toHaveLength(4);
    db.close();
  });

  it("posts welcome on join only once, and only right after the bot is added", () => {
    expect(
      shouldPostWelcomeOnJoin({
        joinedAt: new Date(),
        alreadyPosted: false,
      }),
    ).toBe(true);
    expect(
      shouldPostWelcomeOnJoin({
        joinedAt: new Date(),
        alreadyPosted: true,
      }),
    ).toBe(false);
    expect(
      shouldPostWelcomeOnJoin({
        joinedAt: new Date(Date.now() - 10 * 60_000),
        alreadyPosted: false,
      }),
    ).toBe(false);
  });

  it("posts a new welcome message even if one was already stored", async () => {
    const db = openTestDatabase();
    new GuildWelcomeRepository(db).upsert({
      guildId: "g1",
      channelId: "c-welcome",
      messageId: "old-welcome",
    });
    const sent: string[] = [];
    const posted = await publishWelcomeMessage({
      db,
      channel: {
        id: "c-welcome",
        guild: { id: "g1" },
        async send() {
          sent.push("new");
          return { id: "new-welcome", channel: { id: "c-welcome" } };
        },
      } as never,
      languages: languagesForWelcome(db, "g1"),
    });

    expect(sent).toEqual(["new"]);
    expect(posted.messageId).toBe("new-welcome");
    expect(new GuildWelcomeRepository(db).get("g1")?.messageId).toBe(
      "new-welcome",
    );
    db.close();
  });
});
