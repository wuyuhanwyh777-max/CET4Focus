import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Parse args
const args = process.argv.slice(2);
let limit = 100;
let doAll = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) { limit = parseInt(args[i + 1]); i++; }
  else if (args[i] === "--all") doAll = true;
}

// Load word list
const cet4Path = resolve(ROOT, "src/data/cet4Words.ts");
const wordPattern = /w\("([^"]+)"/g;
const allWords = [];
const cet4Content = readFileSync(cet4Path, "utf8");
let m;
while ((m = wordPattern.exec(cet4Content)) !== null) {
  if (!allWords.includes(m[1])) allWords.push(m[1]);
}
console.log(`Total CET-4 words: ${allWords.length}`);

// Load existing examples
const manualPath = resolve(ROOT, "src/data/wordExamples.ts");
const generatedPath = resolve(ROOT, "src/data/generatedExamples.json");

const manualKeys = new Set();
const m2 = cet4Content.matchAll(/^  (\w+):/gm);
// Actually, just load wordExamples for check
const manualContent = readFileSync(manualPath, "utf8");
const manualMatch = manualContent.matchAll(/^  (\w+):/gm);
for (const mm of manualMatch) manualKeys.add(mm[1]);

let generated = {};
if (existsSync(generatedPath)) {
  try { generated = JSON.parse(readFileSync(generatedPath, "utf8")); } catch { /* empty */ }
}

// Find missing
const missing = allWords.filter((w) => !manualKeys.has(w.toLowerCase()) && !generated[w.toLowerCase()]);
console.log(`Has manual: ${manualKeys.size}, Has generated: ${Object.keys(generated).length}, Missing: ${missing.length}`);

const toProcess = doAll ? missing : missing.slice(0, limit);
console.log(`Processing: ${toProcess.length} words\n`);

// Free Dictionary API (no key needed)
async function fetchFreeDict(word) {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    for (const entry of data) {
      if (!Array.isArray(entry.meanings)) continue;
      for (const meaning of entry.meanings) {
        if (!Array.isArray(meaning.definitions)) continue;
        for (const def of meaning.definitions) {
          if (def.example && def.example.length > 15 && def.example.toLowerCase().includes(word.toLowerCase())) {
            return { en: def.example, source: "free-dictionary" };
          }
        }
      }
    }
    return null;
  } catch { return null; }
}

let added = 0;
let failed = 0;

for (let i = 0; i < toProcess.length; i++) {
  const word = toProcess[i];
  process.stdout.write(`[${i + 1}/${toProcess.length}] ${word} ... `);

  let result = null;
  result = await fetchFreeDict(word);

  if (result && result.en && result.en.length > 15 && result.en.toLowerCase().includes(word.toLowerCase())) {
    generated[word.toLowerCase()] = { en: result.en, zh: "" };
    writeFileSync(generatedPath, JSON.stringify(generated, null, 2), "utf8");
    added++;
    console.log(`✅ ${result.source}`);
  } else {
    failed++;
    console.log("❌ no example");
  }

  // Rate limit
  await new Promise((r) => setTimeout(r, 350));
}

console.log(`\n=== Summary ===`);
console.log(`Processed: ${toProcess.length}`);
console.log(`Added: ${added}`);
console.log(`Failed: ${failed}`);
console.log(`Generated total: ${Object.keys(generated).length}`);
