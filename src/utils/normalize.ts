import type { NormalizedWord, WordExample, WordMeaning } from "../types";
import { getTodayDate } from "./date";
import { findCet4Word } from "../data/cet4Words";

export const EMPTY_EXAMPLE = "暂无可靠例句";
export const EMPTY_TRANSLATION = "暂无可靠翻译";
export const EMPTY_ZH = "暂无可靠中文释义";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstMeaningValue(meanings: unknown, key: string): string {
  if (!Array.isArray(meanings)) return "";
  for (const meaning of meanings) {
    if (meaning && typeof meaning === "object" && key in meaning) {
      const value = asText((meaning as Record<string, unknown>)[key]);
      if (value) return value;
    }
  }
  return "";
}

function normalizeExamples(data: Record<string, unknown>): WordExample[] {
  const examples: WordExample[] = [];
  const push = (en: string, zh: string, source: WordExample["source"] = "local") => {
    if (!en) return;
    examples.push({ en, zh: zh || EMPTY_TRANSLATION, source });
  };

  if (Array.isArray(data.examples)) {
    for (const item of data.examples) {
      if (typeof item === "string") push(item, "", "local");
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        push(
          asText(record.en) || asText(record.example) || asText(record.sentence),
          asText(record.zh) || asText(record.translation) || asText(record.exampleCN),
          (record.source as WordExample["source"]) || "local"
        );
      }
    }
  }

  push(
    asText(data.example) || asText(data.sentence) || asText(data.en),
    asText(data.exampleCN) || asText(data.exampleTranslation) || asText(data.translation) || asText(data.zh),
    (data.source as WordExample["source"]) || "local"
  );

  return examples.length ? examples.slice(0, 2) : [{ en: EMPTY_EXAMPLE, zh: EMPTY_TRANSLATION, source: "none" }];
}

export function normalizeWordData(input: Record<string, unknown> | NormalizedWord): NormalizedWord {
  const rawWord = asText(input.word).toLowerCase();
  const local = rawWord ? findCet4Word(rawWord) : undefined;
  const merged = { ...(local || {}), ...input } as Record<string, unknown>;
  const word = asText(merged.word).toLowerCase();
  const localMeaning = local?.meanings[0];

  const partOfSpeech =
    asText(merged.partOfSpeech) ||
    firstMeaningValue(merged.meanings, "partOfSpeech") ||
    localMeaning?.partOfSpeech ||
    "";
  const rawDefinitionZh =
    asText(merged.definitionZh) ||
    asText(merged.chinese) ||
    firstMeaningValue(merged.meanings, "definitionZh") ||
    localMeaning?.definitionZh ||
    EMPTY_ZH;
  const definitionZh = localMeaning?.definitionZh || rawDefinitionZh;
  const definitionEn =
    asText(merged.definitionEn) ||
    asText(merged.definition) ||
    firstMeaningValue(merged.meanings, "definitionEn") ||
    localMeaning?.definitionEn ||
    "";
  const meanings: WordMeaning[] =
    Array.isArray(merged.meanings) && merged.meanings.length
      ? (merged.meanings as Record<string, unknown>[]).map((meaning) => ({
          partOfSpeech: asText(meaning.partOfSpeech) || partOfSpeech,
          // CET-4 本地词库保存的是更适合背词的短中文意思，优先保留它。
          definitionZh: localMeaning?.definitionZh || asText(meaning.definitionZh) || asText(meaning.chinese) || definitionZh,
          definitionEn: asText(meaning.definitionEn) || asText(meaning.definition) || definitionEn,
        }))
      : [{ partOfSpeech, definitionZh, definitionEn }];

  return {
    word,
    phoneticUK: asText(merged.phoneticUK) || asText(merged.ukphone) || asText(merged.phonetic),
    phoneticUS: asText(merged.phoneticUS) || asText(merged.usphone),
    meanings,
    examples: normalizeExamples(merged),
    isCET4: Boolean(merged.isCET4 ?? local?.isCET4 ?? false),
    isHighFrequency: Boolean(merged.isHighFrequency ?? local?.isHighFrequency ?? false),
    isKeyWord: Boolean(merged.isKeyWord ?? local?.isKeyWord ?? false),
    tags: Array.isArray(merged.tags) ? (merged.tags as string[]) : local?.tags || [],
    addedAt: asText(merged.addedAt),
    learnedAt: asText(merged.learnedAt),
    lastReviewDate: asText(merged.lastReviewDate),
    nextReviewDate: asText(merged.nextReviewDate),
    reviewCount: Number(merged.reviewCount || 0),
    wrongCount: Number(merged.wrongCount || 0),
    masteryStatus: (asText(merged.masteryStatus) as NormalizedWord["masteryStatus"]) || "未掌握",
    source: (merged.source as NormalizedWord["source"]) || (local ? "local" : "none"),
  };
}

export function withReviewDefaults(word: NormalizedWord): NormalizedWord {
  const today = getTodayDate();
  return normalizeWordData({
    ...word,
    addedAt: word.addedAt || today,
    nextReviewDate: word.nextReviewDate || today,
    masteryStatus: word.masteryStatus || "未掌握",
  });
}
