export default async (req) => {
  const url = new URL(req.url);
  const word = url.searchParams.get("word");
  if (!word) {
    return Response.json({ error: "missing word parameter" }, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const results = { word, exampleEn: "", exampleCn: "", definitionEn: "", phoneticUK: "", phoneticUS: "", partOfSpeech: "", source: "none" };

  // 1. Try Merriam-Webster
  const mwKey = process.env.MW_API_KEY;
  if (mwKey) {
    try {
      const r = await fetch(`https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${mwKey}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0 && typeof data[0] !== "string") {
          const entry = data[0];
          results.partOfSpeech = entry.fl || "";
          if (Array.isArray(entry.shortdef)) {
            results.definitionEn = entry.shortdef.join("; ");
          }
          // Extract example from MW
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
                              const t = vis.t || "";
                              if (t && t.length > 20 && t.includes(word)) {
                                results.exampleEn = t.replace(/\{[^}]*\}/g, "").trim();
                                break;
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
          if (results.definitionEn || results.exampleEn) results.source = "merriam-webster";
        }
      }
    } catch { /* MW failed, try next */ }
  }

  // 2. Try Free Dictionary
  if (!results.exampleEn) {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          const entry = data[0];
          if (!results.phoneticUK) {
            const uk = (entry.phonetics || []).find((p) => p?.text && /uk|gb/i.test(`${p.audio || ""}`));
            results.phoneticUK = uk?.text || "";
          }
          if (!results.phoneticUS) {
            const us = (entry.phonetics || []).find((p) => p?.text && /us|american/i.test(`${p.audio || ""}`));
            results.phoneticUS = us?.text || entry.phonetics?.[0]?.text || "";
          }
          if (Array.isArray(entry.meanings)) {
            for (const m of entry.meanings) {
              if (Array.isArray(m.definitions)) {
                for (const d of m.definitions) {
                  if (d.example && d.example.length > 15 && d.example.includes(word)) {
                    results.exampleEn = d.example;
                    if (!results.partOfSpeech) results.partOfSpeech = m.partOfSpeech || "";
                    if (!results.definitionEn) results.definitionEn = d.definition || "";
                    results.source = "free-dictionary";
                    break;
                  }
                }
              }
              if (results.exampleEn) break;
            }
          }
        }
      }
    } catch { /* Free Dictionary failed */ }
  }

  return Response.json(results, { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
};
