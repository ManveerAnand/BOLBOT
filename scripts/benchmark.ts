import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnv } from "../src/config/env.js";
import { TranslationError } from "../src/translation/provider.js";
import { OmlxTranslateGemmaProvider } from "../src/translation/omlxProvider.js";

const execFileAsync = promisify(execFile);

const SAMPLES = {
  short: "gg guys, I'll be back in 10",
  medium: "bro are we doing raid tonight? I can join after dinner.",
  long: "If we start at 9, I can tank the first two bosses, but I need a break before the last one because I have a call.",
  mixed: "这个 boss is actually broken lol",
  emoji: "nahhh that was crazy",
  code: "use `git status` then ping me",
} as const;

async function diskSnapshot(): Promise<string> {
  const { stdout } = await execFileAsync("df", ["-h", "/"]);
  return stdout.trim().split("\n").at(-1) ?? "";
}

async function runBatch(
  provider: OmlxTranslateGemmaProvider,
  texts: string[],
  concurrency: number,
): Promise<{ ok: number; failed: number; inferenceMs: number[] }> {
  const inferenceMs: number[] = [];
  let ok = 0;
  let failed = 0;

  for (let index = 0; index < texts.length; index += concurrency) {
    const batch = texts.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map((text) =>
        provider.translate({
          text,
          sourceLanguage: "en",
          targetLanguage: "zh",
        }),
      ),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        ok += 1;
        inferenceMs.push(result.value.inferenceMs);
      } else {
        failed += 1;
      }
    }
  }

  return { ok, failed, inferenceMs };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

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

  process.stdout.write(`Disk: ${await diskSnapshot()}\n`);
  process.stdout.write(`Memory rss start: ${process.memoryUsage.rss()}\n`);

  for (const [name, text] of Object.entries(SAMPLES)) {
    const result = await provider.translate({
      text,
      sourceLanguage: "en",
      targetLanguage: "zh",
    });
    process.stdout.write(
      `${name}: ${result.inferenceMs}ms chars=${text.length} out=${result.text.length}\n`,
    );
  }

  for (const concurrency of [1, 2]) {
    const batch = await runBatch(
      provider,
      [SAMPLES.short, SAMPLES.medium, SAMPLES.emoji, SAMPLES.mixed],
      concurrency,
    );
    process.stdout.write(
      `concurrency=${concurrency} ok=${batch.ok} failed=${batch.failed} avgMs=${average(batch.inferenceMs)}\n`,
    );
  }

  process.stdout.write(`Memory rss end: ${process.memoryUsage.rss()}\n`);
  process.stdout.write(`Disk: ${await diskSnapshot()}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown benchmark failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
