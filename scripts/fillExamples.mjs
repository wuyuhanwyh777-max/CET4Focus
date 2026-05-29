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
let reportMissing = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--limit" && args[i + 1]) { limit = parseInt(args[i + 1]); i++; }
  else if (a.startsWith("--limit=")) { limit = parseInt(a.split("=")[1]); }
  else if (a === "--all") doAll = true;
  else if (a === "--provider" && args[i + 1]) { provider = args[i + 1]; i++; }
  else if (a.startsWith("--provider=")) { provider = a.split("=")[1]; }
  else if (a === "--report-missing") reportMissing = true;
  else if (a === "--import-manual") importManual();
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

// --report-missing: output missing word list (txt + json) and exit
if (reportMissing) {
  const txtPath = resolve(ROOT, "data/missingExamples.txt");
  const jsonPath = resolve(ROOT, "data/missingExamples.json");
  // Load CET-4 word data for priority sorting
  const wordDataMap = new Map();
  const wdRe = /w\("([^"]+)",\s*"([^"]*)",\s*"([^"]*)",[^,]*,?\s*(true|false),\s*(true|false)/g;
  let wm;
  while ((wm = wdRe.exec(cet4Content)) !== null) {
    wordDataMap.set(wm[1].toLowerCase(), { pos: wm[2], zh: wm[3], high: wm[4] === "true", key: wm[5] === "true" });
  }
  // Sort: high freq + key first, then by letter
  const sorted = [...missing].sort((a, b) => {
    const da = wordDataMap.get(a);
    const db = wordDataMap.get(b);
    const sa = (da?.high ? 2 : 0) + (da?.key ? 1 : 0);
    const sb = (db?.high ? 2 : 0) + (db?.key ? 1 : 0);
    if (sa !== sb) return sb - sa;
    return a.localeCompare(b);
  });
  writeFileSync(txtPath, sorted.join("\n"), "utf8");
  // Group by first letter for JSON
  const grouped = {};
  for (const w of sorted) {
    const l = /^[a-z]/i.test(w) ? w[0].toUpperCase() : "#";
    if (!grouped[l]) grouped[l] = [];
    grouped[l].push(w);
  }
  writeFileSync(jsonPath, JSON.stringify({ total: sorted.length, byLetter: grouped }, null, 2), "utf8");
  console.log(`Written ${sorted.length} missing words to data/missingExamples.txt and data/missingExamples.json`);
  process.exit(0);
}

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
// Supports two formats:
//   Format A: eng<TAB>cmn  (2 columns)
//   Format B: id<TAB>eng<TAB>...<TAB>cmn (4+ columns, official export)
let tatoebaData = null;

function isValidSentence(text, minLen, maxLen) {
  if (!text || text.length < minLen || text.length > maxLen) return false;
  // Skip lines with URLs, HTML, emails, garbled chars
  if (/https?:|www\.|<[a-z/]|@\w+\.com|█|�/.test(text)) return false;
  return true;
}

function loadTatoeba() {
  if (tatoebaData) return tatoebaData;
  const path = resolve(ROOT, "data/tatoeba-eng-cmn.tsv");
  if (!existsSync(path)) {
    console.log("⚠ Tatoeba file not found at data/tatoeba-eng-cmn.tsv — skipping");
    console.log("  Download from https://tatoeba.org/en/downloads or use a custom TSV with columns: eng<TAB>cmn");
    tatoebaData = [];
    return tatoebaData;
  }
  console.log("Loading Tatoeba data...");
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  tatoebaData = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Skip header rows
    if (i === 0 && /^(id|sentence|eng|cmn|lang)/i.test(line)) continue;
    const parts = line.split("\t");
    let eng, cmn;
    if (parts.length === 2) {
      eng = parts[0].trim();
      cmn = parts[1].trim();
    } else if (parts.length === 3) {
      // ManyThings format: eng<TAB>cmn<TAB>attribution
      eng = parts[0].trim();
      cmn = parts[1].trim();
    } else if (parts.length >= 4) {
      // Format B: id<TAB>eng_lang<TAB>eng<TAB>id2<TAB>cmn_lang<TAB>cmn
      // Find first plausible English text (has Latin chars) and first Chinese text (has CJK chars)
      for (const p of parts) {
        const t = p.trim();
        if (!eng && /[a-zA-Z]/.test(t) && /[a-zA-Z]{3,}/.test(t)) eng = t;
        else if (eng && /[一-鿿]/.test(t)) { cmn = t; break; }
      }
    } else {
      continue;
    }
    if (!isValidSentence(eng, 10, 250)) { skipped++; continue; }
    if (!isValidSentence(cmn, 2, 120)) { skipped++; continue; }
    // Must contain CJK characters for Chinese
    if (!/[一-鿿]/.test(cmn)) { skipped++; continue; }
    tatoebaData.push({ en: eng, zh: cmn });
  }
  console.log(`Tatoeba: loaded ${tatoebaData.length} sentence pairs (skipped ${skipped} invalid)`);
  return tatoebaData;
}

// Generate safe word-form regex for Tatoeba matching
function wordFormRegex(word) {
  const lower = word.toLowerCase();
  const esc = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // For short words (<4 chars), only exact match
  if (lower.length < 4) return new RegExp(`(?<![a-zA-Z])${esc}(?![a-zA-Z])`, "i");
  // Common suffixes for longer words
  const forms = [esc];
  // Noun plurals
  if (!lower.endsWith("s")) forms.push(esc + "s");
  if (lower.endsWith("y")) forms.push(esc.slice(0, -1) + "ies");
  if (lower.endsWith("f")) forms.push(esc.slice(0, -1) + "ves");
  // Verb forms
  forms.push(esc + "es", esc + "ed", esc + "ing");
  if (lower.endsWith("e")) forms.push(esc.slice(0, -1) + "ing", esc.slice(0, -1) + "ed");
  if (/[^aeiou][aeiou][^aeiou]$/.test(lower)) forms.push(esc + lower.slice(-1) + "ing", esc + lower.slice(-1) + "ed");
  // Adjective forms
  forms.push(esc + "er", esc + "est");
  if (lower.endsWith("e")) forms.push(esc.slice(0, -1) + "er", esc.slice(0, -1) + "est");
  // Noun forms
  forms.push(esc + "ment", esc + "tion", esc + "ness", esc + "ity");
  if (lower.endsWith("e")) forms.push(esc.slice(0, -1) + "ation");
  if (lower.endsWith("t")) forms.push(esc + "ion");
  // Adverb
  forms.push(esc + "ly");
  if (lower.endsWith("le")) forms.push(esc.slice(0, -2) + "ly");
  // Remove duplicates
  const unique = [...new Set(forms)];
  return new RegExp(`(?<![a-zA-Z])(${unique.join("|")})(?![a-zA-Z])`, "i");
}

function fetchTatoeba(word) {
  const data = loadTatoeba();
  if (!data.length) return null;
  const re = wordFormRegex(word);
  const candidates = data.filter((item) =>
    re.test(item.en) &&
    item.en.length >= 25 && item.en.length <= 140 &&
    item.zh.length >= 4 && item.zh.length <= 80
  );
  if (!candidates.length) return null;
  // Pick best: prefer sentences with balanced length near 60 chars
  candidates.sort((a, b) => Math.abs(a.en.length - 60) - Math.abs(b.en.length - 60));
  return { en: candidates[0].en, zh: candidates[0].zh, source: "tatoeba" };
}

// ================ Main loop ================
let added = 0;
let skipped = 0;
let failed = 0;
// ================ Oxford provider ================
async function fetchOxford(word) {
  const appId = process.env.OXFORD_APP_ID;
  const appKey = process.env.OXFORD_APP_KEY;
  if (!appId || !appKey) return null;
  try {
    const r = await fetch(`https://od-api.oxforddictionaries.com/api/v2/entries/en-gb/${encodeURIComponent(word)}`, {
      headers: { app_id: appId, app_key: appKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    for (const result of data.results || []) {
      for (const lex of result.lexicalEntries || []) {
        for (const entry of lex.entries || []) {
          for (const sense of entry.senses || []) {
            for (const ex of sense.examples || []) {
              const txt = ex.text || "";
              if (txt.length > 20 && txt.toLowerCase().includes(word.toLowerCase())) {
                return { en: txt, source: "oxford" };
              }
            }
          }
        }
      }
    }
    return null;
  } catch { return null; }
}

// ================ Merriam-Webster provider ================
async function fetchMW(word) {
  const apiKey = process.env.MW_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch(`https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${apiKey}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0 || typeof data[0] === "string") return null;
    const entry = data[0];
    if (Array.isArray(entry.def)) {
      for (const def of entry.def) {
        if (Array.isArray(def.sseq)) {
          for (const sseq of def.sseq) {
            if (Array.isArray(sseq)) {
              for (const item of sseq) {
                if (item[0] === "sense" && item[1]?.dt) {
                  for (const dt of item[1].dt) {
                    if (dt[0] === "vis" && Array.isArray(dt[1])) {
                      for (const vis of dt[1]) {
                        const t = (vis.t || "").replace(/\{[^}]*\}/g, "").trim();
                        if (t.length > 20 && t.toLowerCase().includes(word.toLowerCase())) {
                          return { en: t, source: "merriam-webster" };
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return null;
  } catch { return null; }
}

// ================ Import manual ================
function importManual() {
  const path = resolve(ROOT, "data/manualExamplesTemplate.json");
  if (!existsSync(path)) { console.log("data/manualExamplesTemplate.json not found"); process.exit(0); }
  const data = JSON.parse(readFileSync(path, "utf8"));
  let imported = 0;
  for (const [word, ex] of Object.entries(data)) {
    const en = (ex.exampleEn || "").trim();
    const cn = (ex.exampleCn || "").trim();
    if (!en || !cn) { console.log(`SKIP ${word}: empty fields`); continue; }
    if (!en.toLowerCase().includes(word.toLowerCase())) { console.log(`SKIP ${word}: example missing target word`); continue; }
    generated[word.toLowerCase()] = { en, zh: cn };
    writeFileSync(generatedPath, JSON.stringify(generated, null, 2), "utf8");
    imported++;
    console.log(`IMPORTED ${word}`);
  }
  console.log(`\nImported ${imported} entries from manualExamplesTemplate.json`);
  process.exit(0);
}

const providers = provider === "all"
  ? ["free", "tatoeba"]
  : [provider];

async function tryAll(word) {
  for (const p of providers) {
    let result = null;
    if (p === "free") result = await fetchFreeDict(word);
    else if (p === "tatoeba") result = fetchTatoeba(word);
    else if (p === "mw") result = await fetchMW(word);
    else if (p === "oxford") result = await fetchOxford(word);
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
