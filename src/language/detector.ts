export interface LanguageDetection {
  language: string;
  confidence: number;
  candidates?: Array<{
    language: string;
    confidence: number;
  }>;
}

export interface LanguageDetector {
  detect(
    text: string,
    preferredLanguage?: string,
  ): Promise<LanguageDetection>;
}
