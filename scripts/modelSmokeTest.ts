import { loadEnv } from "../src/config/env.js";
import { TranslationError } from "../src/translation/provider.js";
import { OmlxTranslateGemmaProvider } from "../src/translation/omlxProvider.js";
import { parseNamedArgs, requiredString } from "./cliArgs.js";

async function main(): Promise<void> {
  const args = parseNamedArgs(process.argv.slice(2));
  const sourceLanguage = requiredString(args, "from");
  const targetLanguage = requiredString(args, "to");
  const text = requiredString(args, "text");

  const env = loadEnv();
  const provider = new OmlxTranslateGemmaProvider(env);
  const healthy = await provider.healthCheck();
  if (!healthy) {
    throw new TranslationError(
      "model_offline",
      `The translation model is not reachable at ${env.TRANSLATION_BASE_URL}`,
    );
  }

  const result = await provider.translate({
    text,
    sourceLanguage,
    targetLanguage,
  });

  process.stdout.write(
    `Source: ${sourceLanguage}\n` +
      `Target: ${targetLanguage}\n` +
      `Translation: ${result.text}\n` +
      `Inference ms: ${result.inferenceMs}\n` +
      `Model: ${result.model}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown smoke test failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
