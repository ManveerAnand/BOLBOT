import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../../src/config/env";
import { OmlxTranslateGemmaProvider } from "../../../src/translation/omlxProvider";
import type { TranslateRequest } from "../../../src/translation/provider";

const request: TranslateRequest = { sourceLanguage: "tr", targetLanguage: "en", text: "Bu akşam oyun var mı?" };

function stubFetch(reply: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

afterEach(() => vi.unstubAllGlobals());

describe("translation runners", () => {
  it("sends oMLX a templated prompt on /v1/completions", async () => {
    const fetchMock = stubFetch({ choices: [{ text: "Any games tonight?" }] });
    const provider = new OmlxTranslateGemmaProvider(loadEnv({}));

    const result = await provider.translate(request);

    const { url, body } = sent(fetchMock);
    expect(url).toBe("http://127.0.0.1:8000/v1/completions");
    expect(String(body.prompt).startsWith("<bos>")).toBe(true);
    expect(result.text).toBe("Any games tonight?");
  });

  it("sends Ollama the same prompt raw, without its own <bos>", async () => {
    const fetchMock = stubFetch({ response: "Any games tonight?", model: "translategemma:4b" });
    const provider = new OmlxTranslateGemmaProvider(
      loadEnv({
        TRANSLATION_RUNNER: "ollama",
        TRANSLATION_BASE_URL: "http://127.0.0.1:11434",
        TRANSLATION_MODEL: "translategemma:4b",
      }),
    );

    const result = await provider.translate(request);

    const { url, body } = sent(fetchMock);
    expect(url).toBe("http://127.0.0.1:11434/api/generate");
    expect(body).toMatchObject({ raw: true, stream: false, keep_alive: -1, model: "translategemma:4b" });
    expect(String(body.prompt).startsWith("<start_of_turn>user")).toBe(true);
    expect(result.text).toBe("Any games tonight?");
  });
});
