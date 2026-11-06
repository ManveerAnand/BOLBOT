export interface TranslateRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateResult {
  text: string;
  inferenceMs: number;
  model: string;
}

export interface TranslationProvider {
  translate(request: TranslateRequest): Promise<TranslateResult>;
  healthCheck(): Promise<boolean>;
}

export class TranslationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TranslationError";
    this.code = code;
  }
}
