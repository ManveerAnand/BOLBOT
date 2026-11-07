import { loadEnv } from "../src/config/env.js";
import { TranslationError } from "../src/translation/provider.js";
import { OmlxTranslateGemmaProvider } from "../src/translation/omlxProvider.js";

interface MatrixCase {
  from: string;
  to: string;
  text: string;
}

const CASES: readonly MatrixCase[] = [
  { from: "en", to: "zh", text: "gg guys, I'll be back in 10" },
  { from: "zh", to: "en", text: "今晚有人想一起玩吗？" },
  { from: "en", to: "id", text: "bro are we doing raid tonight?" },
  { from: "id", to: "en", text: "aku join setelah makan" },
  { from: "zh", to: "id", text: "这个boss真的太强了" },
  { from: "id", to: "zh", text: "aku join setelah makan" },
  { from: "en", to: "ja", text: "nahhh that was crazy" },
  { from: "ja", to: "en", text: "今夜一緒に遊ぶ人いる？" },
];

async function main(): Promise<void> {
  const env = loadEnv();
  const provider = new OmlxTranslateGemmaProvider(env);
  const healthy = await provider.healthCheck();
  if (!healthy) {
    throw new TranslationError(
      "model_offline",
      `The translation model is not reachable at ${env.TRANSLATION_BASE_URL}`,
    );
  }

  let failures = 0;

  for (const testCase of CASES) {
    try {
      const result = await provider.translate({
        text: testCase.text,
        sourceLanguage: testCase.from,
        targetLanguage: testCase.to,
      });
      process.stdout.write(
        `${testCase.from}->${testCase.to}  ${result.inferenceMs}ms  ${result.text}\n`,
      );
    } catch (error) {
      failures += 1;
      const message =
        error instanceof Error ? error.message : "unknown error";
      process.stderr.write(`${testCase.from}->${testCase.to} FAILED  ${message}\n`);
    }
  }

  if (failures > 0) {
    throw new Error(`Language matrix failed for ${failures} pair(s)`);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown matrix failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
