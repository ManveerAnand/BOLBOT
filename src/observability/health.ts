export interface HealthSnapshot {
  database: "ok" | "error";
  translation: "ok" | "offline";
  languageDetector: "ok" | "offline" | "uninitialized";
  checkedAt: string;
}

export interface HealthCheck {
  check(): Promise<boolean>;
}

export class HealthService {
  constructor(
    private readonly deps: {
      database: HealthCheck;
      translation: HealthCheck;
      languageDetector?: HealthCheck;
    },
  ) {}

  async snapshot(): Promise<HealthSnapshot> {
    const [database, translation, languageDetector] = await Promise.all([
      this.safeCheck(this.deps.database),
      this.safeCheck(this.deps.translation),
      this.deps.languageDetector
        ? this.safeCheck(this.deps.languageDetector)
        : Promise.resolve("uninitialized" as const),
    ]);

    return {
      database: database ? "ok" : "error",
      translation: translation ? "ok" : "offline",
      languageDetector:
        languageDetector === "uninitialized"
          ? "uninitialized"
          : languageDetector
            ? "ok"
            : "offline",
      checkedAt: new Date().toISOString(),
    };
  }

  private async safeCheck(
    check: HealthCheck,
  ): Promise<boolean> {
    try {
      return await check.check();
    } catch {
      return false;
    }
  }
}
