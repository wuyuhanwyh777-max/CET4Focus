import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const cet4Content = readFileSync(resolve(ROOT, "src/data/cet4Words.ts"), "utf8");
const allWords = [...new Set([...cet4Content.matchAll(/w\("([^"]+)"/g)].map(m => m[1].toLowerCase()))];
console.log(`Total CET-4 words: ${allWords.length}`);

function loadJSON(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return {}; }
}

const manualContent = readFileSync(resolve(ROOT, "src/data/wordExamples.ts"), "utf8");
const manualKeys = new Set([...manualContent.matchAll(/^  (\w+):/gm)].map(m => m[1].toLowerCase()));

const generated = loadJSON(resolve(ROOT, "src/data/generatedExamples.json"));
const completion = loadJSON(resolve(ROOT, "src/data/completionExamples.json"));

let covered = 0, missing = 0, invalid = 0;
const missingList = [], invalidList = [];

function wordMatch(text, word) {
  if (word.length < 4) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-zA-Z])${esc}(?![a-zA-Z])`, "i").test(text);
  }
  return text.toLowerCase().includes(word.toLowerCase());
}

function validateEntry(en, cn, word) {
  if (!en || en === "暂无可靠例句") return { ok: false, reason: "empty en" };
  if (!cn || cn === "暂无可靠翻译") return { ok: false, reason: "empty cn" };
  if (!wordMatch(en, word)) return { ok: false, reason: "en missing word", en: en.slice(0, 80) };
  if (en.length < 18) return { ok: false, reason: `en too short (${en.length})` };
  if (en.length > 250) return { ok: false, reason: `en too long (${en.length})` };
  if (cn.length < 2) return { ok: false, reason: "cn too short" };
  if (cn.length > 140) return { ok: false, reason: "cn too long" };
  return { ok: true };
}

for (const word of allWords) {
  // Priority: manual > completion (has cn) > generated
  if (manualKeys.has(word)) { covered++; continue; }

  // Check completion first (it has Chinese)
  const c = completion[word];
  if (c && c.exampleEn && c.exampleEn !== "暂无可靠例句") {
    const r = validateEntry(c.exampleEn, c.exampleCn || "", word);
    if (r.ok) { covered++; continue; }
    invalid++; invalidList.push(`${word}: ${r.reason} (completion)`);
    continue;
  }

  // Then generated (may lack Chinese)
  const g = generated[word];
  if (g && g.en && g.en !== "暂无可靠例句") {
    const r = validateEntry(g.en, g.zh || "", word);
    if (r.ok) { covered++; continue; }
    invalid++; invalidList.push(`${word}: ${r.reason} (generated)`);
    continue;
  }

  missing++; missingList.push(word);
}

console.log(`\nCovered: ${covered}/${allWords.length} (${Math.round(covered / allWords.length * 100)}%)`);
console.log(`Missing: ${missing}  Invalid: ${invalid}`);

if (missingList.length) writeFileSync(resolve(ROOT, "data/stillMissingExamples.txt"), missingList.join("\n"), "utf8");
if (invalidList.length) writeFileSync(resolve(ROOT, "data/invalidExamples.txt"), invalidList.join("\n"), "utf8");
