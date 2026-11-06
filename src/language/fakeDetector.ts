import type { LanguageDetection, LanguageDetector } from "./detector.js";

export class FakeLanguageDetector implements LanguageDetector {
  constructor(
    private readonly detections: Record<string, LanguageDetection>,
  ) {}

  async detect(text: string): Promise<LanguageDetection> {
    return (
      this.detections[text] ?? {
        language: "und",
        confidence: 0,
      }
    );
  }
}
