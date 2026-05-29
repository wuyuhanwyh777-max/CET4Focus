export type MasteryStatus = "未掌握" | "学习中" | "已掌握";
export type ExampleSource = "online" | "local" | "none" | "manual" | "generated" | "tatoeba";

export interface WordMeaning {
  partOfSpeech: string;
  definitionZh: string;
  definitionEn: string;
}

export interface WordExample {
  en: string;
  zh: string;
  source: ExampleSource;
}

export interface NormalizedWord {
  word: string;
  phoneticUK: string;
  phoneticUS: string;
  meanings: WordMeaning[];
  examples: WordExample[];
  isCET4: boolean;
  isHighFrequency: boolean;
  isKeyWord: boolean;
  tags: string[];
  addedAt: string;
  learnedAt: string;
  lastReviewDate: string;
  nextReviewDate: string;
  reviewCount: number;
  wrongCount: number;
  masteryStatus: MasteryStatus;
  source?: "online" | "local" | "cache" | "none" | "manual" | "generated";
}

export interface StudyLog {
  date: string;
  action: "learn-known" | "learn-unknown" | "favorite" | "review-known" | "review-unknown";
  word: string;
  minutes?: number;
}

export interface StudyProgress {
  queue: string[];
  index: number;
  known: string[];
  unknown: string[];
  startedAt: string;
  mode: "daily";
}

export interface AppSettings {
  dailyGoal: number;
  theme: "system" | "light";
}

export interface AppState {
  favorites: Record<string, NormalizedWord>;
  records: StudyLog[];
  progress: StudyProgress | null;
  settings: AppSettings;
}

export type Page =
  | "dashboard"
  | "learn"
  | "search"
  | "library"
  | "favorites"
  | "review"
  | "records"
  | "plan"
  | "settings";
