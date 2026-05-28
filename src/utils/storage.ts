import type { AppSettings, NormalizedWord, StudyLog, StudyProgress } from "../types";

export const STORAGE_KEYS = {
  dictionaryCache: "dictionary_cache",
  cet4WordsCache: "cet4_words_cache",
  favoriteWords: "favorite_words",
  learningRecords: "learning_records",
  studyProgress: "study_progress",
  reviewPlan: "review_plan",
  scrollPositions: "scroll_positions",
  appSettings: "app_settings",
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or private-mode failures. UI keeps current in-memory state.
  }
}

export function loadFavorites(): Record<string, NormalizedWord> {
  return readStorage<Record<string, NormalizedWord>>(STORAGE_KEYS.favoriteWords, {});
}

export function saveFavorites(value: Record<string, NormalizedWord>): void {
  writeStorage(STORAGE_KEYS.favoriteWords, value);
}

export function loadRecords(): StudyLog[] {
  return readStorage<StudyLog[]>(STORAGE_KEYS.learningRecords, []);
}

export function saveRecords(value: StudyLog[]): void {
  writeStorage(STORAGE_KEYS.learningRecords, value);
}

export function loadProgress(): StudyProgress | null {
  return readStorage<StudyProgress | null>(STORAGE_KEYS.studyProgress, null);
}

export function saveProgress(value: StudyProgress | null): void {
  writeStorage(STORAGE_KEYS.studyProgress, value);
}

export function loadSettings(): AppSettings {
  return readStorage<AppSettings>(STORAGE_KEYS.appSettings, { dailyGoal: 30, theme: "system" });
}

export function saveSettings(value: AppSettings): void {
  writeStorage(STORAGE_KEYS.appSettings, value);
}

export function getScrollPosition(key: string): number {
  const positions = readStorage<Record<string, number>>(STORAGE_KEYS.scrollPositions, {});
  return positions[key] || 0;
}

export function setScrollPosition(key: string, value: number): void {
  const positions = readStorage<Record<string, number>>(STORAGE_KEYS.scrollPositions, {});
  positions[key] = value;
  writeStorage(STORAGE_KEYS.scrollPositions, positions);
}

export function readVisibleCount(listId: string, fallback: number): number {
  const counts = readStorage<Record<string, number>>("visible_counts", {});
  return counts[listId] || fallback;
}

export function writeVisibleCount(listId: string, count: number): void {
  const counts = readStorage<Record<string, number>>("visible_counts", {});
  counts[listId] = count;
  writeStorage("visible_counts", counts);
}
