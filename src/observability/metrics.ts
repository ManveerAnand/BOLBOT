export class InMemoryMetrics {
  messagesSeenTotal = 0;
  logicalMessagesTotal = 0;
  translationsRequestedTotal = 0;
  translationsCompletedTotal = 0;
  translationsFailedTotal = 0;
  translationsCacheHitTotal = 0;
  languageDetectionFallbackTotal = 0;
  queueDepth = 0;
  jobsActive = 0;
  pendingRetryJobs = 0;

  snapshot(): Record<string, number> {
    return {
      messages_seen_total: this.messagesSeenTotal,
      logical_messages_total: this.logicalMessagesTotal,
      translations_requested_total: this.translationsRequestedTotal,
      translations_completed_total: this.translationsCompletedTotal,
      translations_failed_total: this.translationsFailedTotal,
      translations_cache_hit_total: this.translationsCacheHitTotal,
      language_detection_fallback_total: this.languageDetectionFallbackTotal,
      queue_depth: this.queueDepth,
      jobs_active: this.jobsActive,
      pending_retry_jobs: this.pendingRetryJobs,
    };
  }
}
