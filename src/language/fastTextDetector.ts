import { FastText } from "fasttext.wasm";
import type { LanguageDetection, LanguageDetector } from "./detector.js";
import { resolveSupportedLanguage } from "./registry.js";

function labelToCode(label: string): string {
  return label.startsWith("__label__") ? label.slice("__label__".length) : label;
}

export class FastTextWasmLanguageDetector implements LanguageDetector {
  private engine?: Promise<FastText>;

  private load(): Promise<FastText> {
    this.engine ??= (async () => {
      const fastText = await FastText.create();
      await fastText.loadModel();
      return fastText;
    })();
    return this.engine;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.detect("hello");
      return result.language.length > 0;
    } catch {
      return false;
    }
  }

  async detect(text: string): Promise<LanguageDetection> {
    const engine = await this.load();
    const predictions = [...engine.predict(text, 5, 0).entries()]
      .map(([label, confidence]) => {
        const raw = labelToCode(label);
        const supported = resolveSupportedLanguage(raw);
        return {
          language: supported?.internalCode ?? raw,
          confidence,
        };
      })
      .sort((left, right) => right.confidence - left.confidence);

    const top = predictions[0];
    if (!top) {
      return { language: "und", confidence: 0, candidates: [] };
    }

    return {
      language: top.language,
      confidence: top.confidence,
      candidates: predictions,
    };
  }
}
