import { loadEnv } from "../src/config/env.js";
import { FastTextWasmLanguageDetector } from "../src/language/fastTextDetector.js";
import { SourceLanguageResolver } from "../src/language/sourceLanguageResolver.js";
import { parseNamedArgs, requiredString } from "./cliArgs.js";

async function main(): Promise<void> {
  const args = parseNamedArgs(process.argv.slice(2));
  const text = requiredString(args, "text");
  const preferred =
    typeof args.preferred === "string" ? args.preferred : undefined;

  const env = loadEnv();
  const detector = new FastTextWasmLanguageDetector();
  const resolver = new SourceLanguageResolver(detector, env);
  const result = await resolver.resolve(text, preferred);

  process.stdout.write(
    `Language: ${result.language}\n` +
      `Confidence: ${result.confidence.toFixed(3)}\n` +
      `Source: ${result.source}\n` +
      `Chars: ${result.naturalCharacterCount}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Language detection failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
