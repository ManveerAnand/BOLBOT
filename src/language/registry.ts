export interface SupportedLanguage {
  internalCode: string;
  displayName: string;
  nativeName: string;
  translateGemmaCode: string;
  fastTextCodes: string[];
  enabledByDefault: boolean;
  aliases?: string[];
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  {
    internalCode: "en",
    displayName: "English",
    nativeName: "English",
    translateGemmaCode: "en",
    fastTextCodes: ["en"],
    enabledByDefault: true,
    aliases: ["en-US", "en-GB"],
  },
  {
    internalCode: "zh",
    displayName: "Chinese",
    nativeName: "中文",
    translateGemmaCode: "zh",
    fastTextCodes: ["zh"],
    enabledByDefault: true,
    aliases: ["zh-CN", "zh-TW", "zh-Hans", "zh-Hant", "zh-CH"],
  },
  {
    internalCode: "id",
    displayName: "Indonesian",
    nativeName: "Bahasa Indonesia",
    translateGemmaCode: "id",
    fastTextCodes: ["id"],
    enabledByDefault: true,
    aliases: ["id-ID"],
  },
  {
    internalCode: "ja",
    displayName: "Japanese",
    nativeName: "日本語",
    translateGemmaCode: "ja",
    fastTextCodes: ["ja"],
    enabledByDefault: true,
    aliases: ["ja-JP"],
  },
  {
    internalCode: "ko",
    displayName: "Korean",
    nativeName: "한국어",
    translateGemmaCode: "ko",
    fastTextCodes: ["ko"],
    enabledByDefault: false,
    aliases: ["ko-KR"],
  },
  {
    internalCode: "es",
    displayName: "Spanish",
    nativeName: "Español",
    translateGemmaCode: "es",
    fastTextCodes: ["es"],
    enabledByDefault: false,
    aliases: ["es-ES", "es-MX"],
  },
  {
    internalCode: "fr",
    displayName: "French",
    nativeName: "Français",
    translateGemmaCode: "fr",
    fastTextCodes: ["fr"],
    enabledByDefault: false,
    aliases: ["fr-FR"],
  },
  {
    internalCode: "de",
    displayName: "German",
    nativeName: "Deutsch",
    translateGemmaCode: "de",
    fastTextCodes: ["de"],
    enabledByDefault: false,
    aliases: ["de-DE"],
  },
  {
    internalCode: "hi",
    displayName: "Hindi",
    nativeName: "हिन्दी",
    translateGemmaCode: "hi",
    fastTextCodes: ["hi"],
    enabledByDefault: false,
    aliases: ["hi-IN"],
  },
  {
    internalCode: "pt",
    displayName: "Portuguese",
    nativeName: "Português",
    translateGemmaCode: "pt",
    fastTextCodes: ["pt"],
    enabledByDefault: false,
    aliases: ["pt-BR", "pt-PT"],
  },
  {
    internalCode: "ru",
    displayName: "Russian",
    nativeName: "Русский",
    translateGemmaCode: "ru",
    fastTextCodes: ["ru"],
    enabledByDefault: false,
    aliases: ["ru-RU"],
  },
  {
    internalCode: "tr",
    displayName: "Turkish",
    nativeName: "Türkçe",
    translateGemmaCode: "tr",
    fastTextCodes: ["tr"],
    enabledByDefault: false,
    aliases: ["tr-TR"],
  },
];

const byInternal = new Map(
  SUPPORTED_LANGUAGES.map((language) => [language.internalCode, language]),
);

const byAlias = new Map<string, SupportedLanguage>();
for (const language of SUPPORTED_LANGUAGES) {
  byAlias.set(language.internalCode, language);
  for (const alias of language.aliases ?? []) {
    byAlias.set(alias, language);
  }
  for (const code of language.fastTextCodes) {
    byAlias.set(code, language);
  }
}

export function normalizeLanguageCode(code: string): string {
  return code.trim().replaceAll("_", "-");
}

export function resolveSupportedLanguage(
  code: string,
): SupportedLanguage | undefined {
  const normalized = normalizeLanguageCode(code);
  const direct = byAlias.get(normalized) ?? byAlias.get(normalized.toLowerCase());
  if (direct) {
    return direct;
  }

  const primary = normalized.split("-")[0]?.toLowerCase();
  return primary ? byInternal.get(primary) : undefined;
}

export function requireSupportedLanguage(code: string): SupportedLanguage {
  const language = resolveSupportedLanguage(code);
  if (!language) {
    throw new Error(`Unsupported language code: ${code}`);
  }
  return language;
}

export function defaultEnabledLanguageCodes(): string[] {
  return SUPPORTED_LANGUAGES.filter((language) => language.enabledByDefault).map(
    (language) => language.internalCode,
  );
}

export function resolveLanguageChoice(
  input: string,
): SupportedLanguage | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const byCode = resolveSupportedLanguage(trimmed);
  if (byCode) {
    return byCode;
  }

  const lower = trimmed.toLowerCase();
  return SUPPORTED_LANGUAGES.find(
    (language) =>
      language.displayName.toLowerCase() === lower ||
      language.nativeName === trimmed ||
      language.nativeName.toLowerCase() === lower,
  );
}
