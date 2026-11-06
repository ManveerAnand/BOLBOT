import type { HealthSnapshot } from "../../observability/health.js";
import type { InMemoryMetrics } from "../../observability/metrics.js";

export interface StatusView {
  translatorOnline: boolean;
  modelName: string;
  health: HealthSnapshot;
  roomCount: number;
  enabledLanguageCount: number;
  metrics: InMemoryMetrics;
  uptimeSeconds: number;
}

export function formatUptime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function healthLabel(
  value: HealthSnapshot["translation"] | HealthSnapshot["languageDetector"],
): string {
  if (value === "ok") {
    return "Healthy";
  }
  if (value === "uninitialized") {
    return "Uninitialized";
  }
  return "Offline";
}

export function formatStatusMessage(view: StatusView): string {
  return [
    `Translator: ${view.translatorOnline ? "Online" : "Offline"}`,
    `Model: ${view.modelName}`,
    `Model server: ${healthLabel(view.health.translation)}`,
    `Language detector: ${healthLabel(view.health.languageDetector)}`,
    "",
    `Rooms: ${view.roomCount}`,
    `Enabled languages: ${view.enabledLanguageCount}`,
    "",
    `Queue: ${view.metrics.queueDepth} waiting / ${view.metrics.jobsActive} active`,
    `Pending retries: ${view.metrics.pendingRetryJobs}`,
    "",
    `Uptime: ${formatUptime(view.uptimeSeconds)}`,
  ].join("\n");
}
