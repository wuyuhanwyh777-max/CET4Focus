import type { NormalizedWord, WordExample, WordMeaning } from "../types";
import { findCet4Word } from "../data/cet4Words";
import { EMPTY_EXAMPLE, EMPTY_TRANSLATION, EMPTY_ZH, normalizeWordData } from "../utils/normalize";
import { readStorage, STORAGE_KEYS, writeStorage } from "../utils/storage";

type CacheEntry = {
  word: string;
  data: NormalizedWord;
  source: string;
  cachedAt: string;
};

function readCache(): Record<string, CacheEntry> {
  return readStorage<Record<string, CacheEntry>>(STORAGE_KEYS.dictionaryCache, {});
}

function writeCache(cache: Record<string, CacheEntry>): void {
  writeStorage(STORAGE_KEYS.dictionaryCache, cache);
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanChineseMeaning(explain: string): string {
  const cleaned = explain
    .replace(/^[a-z./\s]+/i, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const parts = cleaned
    .split(/[；;，,、]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.length <= 10)
    .slice(0, 4);
  return [...new Set(parts)].join("；") || cleaned.slice(0, 24);
}

type BingDictData = { phoneticUK: string; phoneticUS: string; partOfSpeech: string; definitionZh: string };

async function fetchBingDict(word: string): Promise<BingDictData | null> {
  try {
    const response = await fetchWithTimeout(`/api/bing/dict/search?q=${encodeURIComponent(word)}`);
    if (!response.ok) return null;
    const html = await response.text();
    const metaMatch = html.match(/<meta name="description" content="([^"]+)"/);
    if (!metaMatch) return null;
    const desc = metaMatch[1];
    const usMatch = desc.match(/美\[([^\]]+)\]/);
    const ukMatch = desc.match(/英\[([^\]]+)\]/);
    let definitionPart = desc;
    // find the definition part after the last phonetic bracket
    const lastPhoneticIdx = Math.max(
      ukMatch ? desc.indexOf("]", desc.indexOf("英[")) + 1 : 0,
      usMatch ? desc.indexOf("]", desc.indexOf("美[")) + 1 : 0
    );
    if (lastPhoneticIdx > 0) {
      definitionPart = desc.slice(lastPhoneticIdx + 1).trim();
    }
    const semicolonIdx = definitionPart.indexOf("；");
    const posAndZh = semicolonIdx > -1 ? definitionPart.slice(0, semicolonIdx) : definitionPart;
    const posMatch = posAndZh.match(/^([a-z]+\.[a-z]?\.?)\s/);
    return {
      phoneticUK: ukMatch ? ukMatch[1] : "",
      phoneticUS: usMatch ? usMatch[1] : "",
      partOfSpeech: posMatch ? posMatch[1] : "",
      definitionZh: posMatch ? posAndZh.slice(posMatch[0].length).trim() : posAndZh.trim(),
    };
  } catch {
    return null;
  }
}

async function fetchChineseMeaning(word: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(`/api/youdao/suggest?q=${encodeURIComponent(word)}&doctype=json`);
    if (!response.ok) return "";
    const data = await response.json();
    const entries = Array.isArray(data?.data?.entries) ? data.data.entries : [];
    const exact = entries.find((entry: any) => String(entry.entry || "").toLowerCase() === word.toLowerCase());
    return exact?.explain ? cleanChineseMeaning(String(exact.explain)) : "";
  } catch {
    return "";
  }
}

export async function fetchOnlineDictionary(word: string): Promise<NormalizedWord> {
  const key = word.trim().toLowerCase();
  const cache = readCache();
  if (cache[key]?.data) {
    const cached = normalizeWordData({ ...cache[key].data, source: "cache" });
    if (cached.meanings[0]?.definitionZh && cached.meanings[0].definitionZh !== EMPTY_ZH) return cached;
  }

  const local = findCet4Word(key);
  const [youdaoZh, bingData] = await Promise.all([
    fetchChineseMeaning(key),
    fetchBingDict(key),
  ]);

  const bestZh = local?.meanings[0]?.definitionZh || youdaoZh || bingData?.definitionZh || "";
  if (!bestZh) {
    throw new Error("未找到这个词的中文释义，请检查拼写。");
  }

  const meanings: WordMeaning[] = [
    {
      partOfSpeech: local?.meanings[0]?.partOfSpeech || bingData?.partOfSpeech || "",
      definitionEn: "",
      definitionZh: bestZh,
    },
  ];
  const normalized = normalizeWordData({
    ...(local || {}),
    word: key,
    meanings,
    examples: [{ en: EMPTY_EXAMPLE, zh: EMPTY_TRANSLATION, source: "none" as const }],
    phoneticUK: bingData?.phoneticUK || "",
    phoneticUS: bingData?.phoneticUS || "",
    source: local ? "local" : "online",
    isCET4: Boolean(local),
  });

  cache[key] = { word: key, data: normalized, source: "youdao+bing", cachedAt: new Date().toISOString() };
  writeCache(cache);
  return normalized;
}
