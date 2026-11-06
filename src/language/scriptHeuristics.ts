export type ScriptFamily =
  | "han"
  | "japanese"
  | "hangul"
  | "cyrillic"
  | "arabic"
  | "devanagari"
  | "latin"
  | "mixed"
  | "unknown";

export interface ScriptHint {
  family: ScriptFamily;
  suggestedLanguage?: string;
  strong: boolean;
}

const HAN = /\p{Script=Han}/u;
const HIRAGANA = /\p{Script=Hiragana}/u;
const KATAKANA = /\p{Script=Katakana}/u;
const HANGUL = /\p{Script=Hangul}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;

export function detectScript(text: string): ScriptHint {
  const hasHan = HAN.test(text);
  const hasKana = HIRAGANA.test(text) || KATAKANA.test(text);
  const hasHangul = HANGUL.test(text);
  const hasCyrillic = CYRILLIC.test(text);
  const hasArabic = ARABIC.test(text);
  const hasDevanagari = DEVANAGARI.test(text);
  const hasLatin = LATIN.test(text);

  if (hasKana) {
    return { family: "japanese", suggestedLanguage: "ja", strong: true };
  }
  if (hasHangul) {
    return { family: "hangul", suggestedLanguage: "ko", strong: true };
  }
  if (hasDevanagari) {
    return { family: "devanagari", suggestedLanguage: "hi", strong: true };
  }
  if (hasHan && !hasLatin) {
    return { family: "han", suggestedLanguage: "zh", strong: true };
  }
  if (hasHan) {
    return { family: "han", suggestedLanguage: "zh", strong: false };
  }
  if (hasCyrillic) {
    return { family: "cyrillic", suggestedLanguage: "ru", strong: true };
  }
  if (hasArabic) {
    return { family: "arabic", strong: true };
  }
  if (hasLatin) {
    return { family: "latin", strong: false };
  }
  return { family: "unknown", strong: false };
}
