import wordExamples from "../data/wordExamples";
import generatedExamplesData from "../data/generatedExamples.json";

type ExampleResult = {
  exampleEn: string;
  exampleCn: string;
  source: "manual" | "generated" | "local" | "online" | "none";
};

const generatedExamples: Record<string, { en: string; zh: string }> = generatedExamplesData;

export function getBestExample(word: string): ExampleResult {
  const key = word.toLowerCase().trim();

  // 1. Manual examples (highest quality)
  if (wordExamples[key]) {
    return { exampleEn: wordExamples[key].en, exampleCn: wordExamples[key].zh, source: "manual" };
  }

  // 2. Generated/cached examples from API
  if (generatedExamples[key]) {
    return { exampleEn: generatedExamples[key].en, exampleCn: generatedExamples[key].zh, source: "generated" };
  }

  // 3. Fallback: no reliable example
  return { exampleEn: "", exampleCn: "", source: "none" };
}

export function hasExample(word: string): boolean {
  const key = word.toLowerCase().trim();
  return !!(wordExamples[key] || generatedExamples[key]);
}
