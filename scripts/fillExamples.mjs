import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Parse args
const args = process.argv.slice(2);
let limit = 100;
let doAll = false;
let provider = "all";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) { limit = parseInt(args[i + 1]); i++; }
  else if (args[i] === "--all") doAll = true;
  else if (args[i] === "--provider" && args[i + 1]) { provider = args[i + 1]; i++; }
}

// Load word list
const cet4Path = resolve(ROOT, "src/data/cet4Words.ts");
const cet4Content = readFileSync(cet4Path, "utf8");
const wordPattern = /w\("([^"]+)"/g;
const allWords = new Set();
let m;
while ((m = wordPattern.exec(cet4Content)) !== null) allWords.add(m[1].toLowerCase());
const allArr = [...allWords];
console.log(`Total CET-4 words: ${allArr.length}`);

// Load manual examples
const manualPath = resolve(ROOT, "src/data/wordExamples.ts");
const manualContent = readFileSync(manualPath, "utf8");
const manualKeys = new Set();
for (const mm of manualContent.matchAll(/^  (\w+):/gm)) manualKeys.add(mm[1].toLowerCase());

// Load generated examples (incremental!)
const generatedPath = resolve(ROOT, "src/data/generatedExamples.json");
let generated = {};
if (existsSync(generatedPath)) {
  try {
    const raw = readFileSync(generatedPath, "utf8");
    if (raw.trim().length > 2) generated = JSON.parse(raw);
  } catch (e) { console.log("Warning: generatedExamples.json parse error, starting fresh"); }
}
const beforeCount = Object.keys(generated).length;
console.log(`Manual: ${manualKeys.size}, Generated: ${beforeCount}`);

// Find missing words
const missing = allArr.filter((w) => !manualKeys.has(w) && !generated[w]);
console.log(`Missing: ${missing.length}`);

const toProcess = doAll ? missing : missing.slice(0, limit);
console.log(`Processing: ${toProcess.length} words (limit=${limit}, provider=${provider})\n`);

// ================ Providers ================

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
          const ex = def.example || "";
          if (ex.length > 15 && ex.toLowerCase().includes(word.toLowerCase())) {
            return { en: ex, source: "free-dictionary" };
          }
        }
      }
    }
    return null;
  } catch { return null; }
}

// Tatoeba: read from local TSV file
let tatoebaData = null;
function loadTatoeba() {
  if (tatoebaData) return tatoebaData;
  const path = resolve(ROOT, "data/tatoeba-eng-cmn.tsv");
  if (!existsSync(path)) {
    console.log("Tatoeba file not found at data/tatoeba-eng-cmn.tsv — skipping");
    tatoebaData = [];
    return tatoebaData;
  }
  console.log("Loading Tatoeba data...");
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n");
  tatoebaData = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 4) {
      const eng = parts[1]?.trim();
      const cmn = parts[3]?.trim();
      if (eng && cmn && eng.length > 15 && eng.length < 200) {
        tatoebaData.push({ en: eng, zh: cmn });
      }
    }
  }
  console.log(`Tatoeba: loaded ${tatoebaData.length} sentence pairs`);
  return tatoebaData;
}

function fetchTatoeba(word) {
  const data = loadTatoeba();
  if (!data.length) return null;
  const lower = word.toLowerCase();
  const re = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const matches = data.filter((item) => re.test(item.en));
  if (!matches.length) return null;
  // Pick a suitable one — prefer medium-length sentences
  const sorted = matches.sort((a, b) => Math.abs(a.en.length - 80) - Math.abs(b.en.length - 80));
  return { en: sorted[0].en, zh: sorted[0].zh, source: "tatoeba" };
}

// ================ Main loop ================
let added = 0;
let skipped = 0;
let failed = 0;
const providers = provider === "all"
  ? ["free", "tatoeba"]
  : [provider];

async function tryAll(word) {
  for (const p of providers) {
    let result = null;
    if (p === "free") result = await fetchFreeDict(word);
    else if (p === "tatoeba") result = fetchTatoeba(word);
    if (result && result.en && result.en.length > 15 && result.en.toLowerCase().includes(word.toLowerCase())) {
      return result;
    }
  }
  return null;
}

for (let i = 0; i < toProcess.length; i++) {
  const word = toProcess[i];
  process.stdout.write(`[${i + 1}/${toProcess.length}] ${word} ... `);

  if (generated[word]) { skipped++; console.log("⏭ already cached"); continue; }

  const result = await tryAll(word);
  if (result) {
    generated[word] = { en: result.en, zh: result.zh || "" };
    writeFileSync(generatedPath, JSON.stringify(generated, null, 2), "utf8");
    added++;
    console.log(`✅ ${result.source}`);
  } else {
    failed++;
    console.log("❌ no example");
  }
  await new Promise((r) => setTimeout(r, 350));
}

const afterCount = Object.keys(generated).length;
console.log(`\n=== Summary ===`);
console.log(`Processed: ${toProcess.length}`);
console.log(`Added: ${added}`);
console.log(`Skipped (already cached): ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Generated total: ${afterCount} (was ${beforeCount} before)`);
console.log(`Combined with manual: ${manualKeys.size + afterCount}`);
