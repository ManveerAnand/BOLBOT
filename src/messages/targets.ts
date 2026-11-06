import type { RoomView } from "../database/types.js";

export function selectFanOutViews(
  sourceView: RoomView,
  views: readonly RoomView[],
): RoomView[] {
  return views.filter((view) => view.enabled && view.id !== sourceView.id);
}

export function needsInference(
  sourceLanguage: string,
  targetLanguage: string,
): boolean {
  return sourceLanguage !== targetLanguage;
}
