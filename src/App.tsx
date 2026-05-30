import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  Home,
  ListChecks,
  RotateCcw,
  Search,
  Settings,
  Star,
  Volume2,
} from "lucide-react";
import { cet4Words, findCet4Word, relatedCet4Words } from "./data/cet4Words";
import { fetchOnlineDictionary } from "./services/dictionary";
import type { AppState, NormalizedWord, Page, StudyLog } from "./types";
import { addDays, compareDate, formatFriendlyDate, getTodayDate } from "./utils/date";
import {
  getScrollPosition,
  loadFavorites,
  loadProgress,
  loadRecords,
  loadSettings,
  saveFavorites,
  saveProgress,
  saveRecords,
  saveSettings,
  setScrollPosition,
} from "./utils/storage";
import { EMPTY_EXAMPLE, EMPTY_TRANSLATION, normalizeWordData, withReviewDefaults } from "./utils/normalize";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const tabs: Array<{ page: Page; label: string; icon: ReactNode }> = [
  { page: "dashboard", label: "首页", icon: <Home size={19} /> },
  { page: "learn", label: "学习", icon: <BookOpen size={19} /> },
  { page: "favorites", label: "生词本", icon: <Star size={19} /> },
  { page: "review", label: "复习", icon: <CalendarClock size={19} /> },
  { page: "search", label: "查词", icon: <Search size={19} /> },
];
const navItems: Array<{ page: Page; label: string; icon: ReactNode }> = [
  ...tabs,
  { page: "library", label: "词库", icon: <ListChecks size={19} /> },
  { page: "records", label: "记录", icon: <BarChart3 size={19} /> },
  { page: "plan", label: "计划", icon: <CalendarClock size={19} /> },
  { page: "settings", label: "我的", icon: <Settings size={19} /> },
];

function createInitialState(): AppState {
  return {
    favorites: loadFavorites(),
    records: loadRecords(),
    progress: loadProgress(),
    settings: loadSettings(),
  };
}

function speak(text: string) {
  if (!("speechSynthesis" in window) || !text || text === EMPTY_EXAMPLE) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function tagClass(tag: string) {
  if (tag.includes("高频")) return "tag hot";
  if (tag.includes("重点")) return "tag key";
  if (tag.includes("CET")) return "tag cet";
  return "tag";
}

function WordTags({ word }: { word: NormalizedWord }) {
  const tags = [
    ...(word.isCET4 ? ["CET-4"] : []),
    ...(word.isHighFrequency ? ["高频词"] : []),
    ...(word.isKeyWord ? ["重点词"] : []),
    ...word.tags.filter((tag) => !["CET-4", "高频", "重点"].includes(tag)),
  ];
  return (
    <div className="tag-row">
      {[...new Set(tags)].map((tag) => (
        <span className={tagClass(tag)} key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function mergeWordData(baseWord: NormalizedWord, onlineWord: NormalizedWord): NormalizedWord {
  const base = normalizeWordData(baseWord);
  const online = normalizeWordData(onlineWord);
  const baseMeaning = base.meanings[0];
  const onlineMeaning = online.meanings[0];
  const onlineExample = online.examples[0];
  const baseExample = base.examples[0];
  return normalizeWordData({
    ...base,
    ...online,
    phoneticUK: online.phoneticUK || base.phoneticUK,
    phoneticUS: online.phoneticUS || base.phoneticUS,
    meanings: [
      {
        partOfSpeech: onlineMeaning.partOfSpeech || baseMeaning.partOfSpeech,
        definitionZh: base.isCET4 ? baseMeaning.definitionZh : onlineMeaning.definitionZh && onlineMeaning.definitionZh !== "暂无可靠中文释义" ? onlineMeaning.definitionZh : baseMeaning.definitionZh,
        definitionEn: onlineMeaning.definitionEn || baseMeaning.definitionEn,
      },
    ],
    examples: onlineExample?.en && onlineExample.en !== EMPTY_EXAMPLE ? [onlineExample] : [baseExample],
    isCET4: base.isCET4 || online.isCET4,
    isHighFrequency: base.isHighFrequency || online.isHighFrequency,
    isKeyWord: base.isKeyWord || online.isKeyWord,
    tags: [...new Set([...base.tags, ...online.tags])],
    addedAt: base.addedAt || online.addedAt,
    learnedAt: base.learnedAt || online.learnedAt,
    lastReviewDate: base.lastReviewDate || online.lastReviewDate,
    nextReviewDate: base.nextReviewDate || online.nextReviewDate,
    reviewCount: base.reviewCount || online.reviewCount,
    wrongCount: base.wrongCount || online.wrongCount,
    masteryStatus: base.masteryStatus || online.masteryStatus,
  });
}

function Phonetics({ word, loading = false }: { word: NormalizedWord; loading?: boolean }) {
  const ukLabel = word.phoneticUK || (loading ? "正在加载音标..." : "暂无音标");
  const usLabel = word.phoneticUS || (loading ? "正在加载音标..." : "暂无音标");
  return (
    <p className="phonetics">
      <span>英 {ukLabel}</span>
      <span>美 {usLabel}</span>
    </p>
  );
}

function WordBody({ word, loading = false }: { word: NormalizedWord; loading?: boolean }) {
  const meaning = word.meanings[0];
  const example = word.examples[0] || { en: EMPTY_EXAMPLE, zh: EMPTY_TRANSLATION };
  const isWaitingExample = loading && (!example.en || example.en === EMPTY_EXAMPLE);
  return (
    <div className="word-body">
      <div>
        <b>词性</b>
        <p>{meaning.partOfSpeech || "暂无"}</p>
      </div>
      <div>
        <b>中文意思</b>
        <p>{meaning.definitionZh}</p>
      </div>
      <div>
        <b>例句</b>
        <p>英文：{isWaitingExample ? "正在加载可靠例句..." : example.en || EMPTY_EXAMPLE}</p>
        <p>中文：{isWaitingExample ? "正在加载可靠翻译..." : example.zh || EMPTY_TRANSLATION}</p>
        {!isWaitingExample && example.en && example.en !== EMPTY_EXAMPLE && (
          <button className="inline-speak" onClick={() => speak(example.en)}>
            <Volume2 size={15} /> 朗读例句
          </button>
        )}
      </div>
    </div>
  );
}

function WordCard({
  word,
  favorite,
  onToggleFavorite,
  onDetail,
  onReview,
  compact = false,
}: {
  word: NormalizedWord;
  favorite: boolean;
  onToggleFavorite: (word: NormalizedWord) => void;
  onDetail: (word: NormalizedWord) => void;
  onReview?: (word: NormalizedWord) => void;
  compact?: boolean;
}) {
  const example = word.examples[0];
  return (
    <article className={`word-card ${compact ? "compact" : ""}`}>
      <div className="word-head">
        <div>
          <h3>{word.word}</h3>
          <Phonetics word={word} />
        </div>
        <button className="icon-button" onClick={() => speak(word.word)} aria-label="发音">
          <Volume2 size={18} />
        </button>
      </div>
      <WordTags word={word} />
      <p className="meaning-line">
        <b>{word.meanings[0].partOfSpeech || "n."}</b> {word.meanings[0].definitionZh}
      </p>
      {!compact && (
        <div className="example-line">
          <p>英文：{example.en}</p>
          <p>中文：{example.zh}</p>
        </div>
      )}
      <div className="button-row">
        <button className={favorite ? "secondary" : "primary"} onClick={() => onToggleFavorite(word)}>
          {favorite ? "已收藏 / 取消收藏" : "加入生词本"}
        </button>
        <button className="secondary" onClick={() => onDetail(word)}>
          查看详情
        </button>
        {onReview && (
          <button className="secondary" onClick={() => onReview(word)}>
            去复习
          </button>
        )}
      </div>
    </article>
  );
}

function usePersistedState() {
  const [state, setState] = useState<AppState>(createInitialState);
  useEffect(() => {
    saveFavorites(state.favorites);
    saveRecords(state.records);
    saveProgress(state.progress);
    saveSettings(state.settings);
  }, [state]);
  return [state, setState] as const;
}

export function App() {
  const [state, setState] = usePersistedState();
  const [page, setPage] = useState<Page>("dashboard");
  const [detail, setDetail] = useState<NormalizedWord | null>(null);
  const [detailBack, setDetailBack] = useState<Page>("dashboard");
  const [toast, setToast] = useState("");
  const today = getTodayDate();

  const favorites = useMemo(() => Object.values(state.favorites).map(normalizeWordData), [state.favorites]);
  const dueWords = favorites.filter((word) => word.nextReviewDate && compareDate(word.nextReviewDate, today) <= 0);
  const todayRecords = state.records.filter((record) => record.date === today);
  const learnedToday = new Set(todayRecords.filter((r) => r.action.startsWith("learn")).map((r) => r.word)).size;
  const streak = computeStreak(state.records);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  function log(action: StudyLog["action"], word: string, minutes = 1) {
    setState((prev) => ({ ...prev, records: [...prev.records, { date: today, action, word, minutes }] }));
  }

  function toggleFavorite(raw: NormalizedWord) {
    const word = withReviewDefaults(normalizeWordData(raw));
    setState((prev) => {
      const next = { ...prev.favorites };
      if (next[word.word]) {
        delete next[word.word];
        notify("已取消收藏");
      } else {
        next[word.word] = word;
        notify("已加入生词本");
      }
      return { ...prev, favorites: next };
    });
    log("favorite", word.word);
  }

  function openDetail(word: NormalizedWord, from: Page) {
    setScrollPosition(`list:${from}`, window.scrollY);
    setDetail(normalizeWordData(word));
    setDetailBack(from);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);
  }

  function closeDetail() {
    const back = detailBack;
    const savedY = getScrollPosition(`list:${back}`);
    setDetail(null);
    setPage(back);
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: "auto" });
        });
      });
    }, 80);
  }

  function startSingleReview(_word: NormalizedWord) {
    navigate("review");
  }

  function markReview(word: NormalizedWord, known: boolean) {
    const nextDate = known
      ? addDays(today, [1, 3, 7, 15][Math.min(word.reviewCount, 3)])
      : addDays(today, 1);
    setState((prev) => ({
      ...prev,
      favorites: {
        ...prev.favorites,
        [word.word]: normalizeWordData({
          ...word,
          reviewCount: word.reviewCount + 1,
          wrongCount: word.wrongCount + (known ? 0 : 1),
          lastReviewDate: today,
          nextReviewDate: nextDate,
          masteryStatus: known && word.reviewCount >= 2 ? "已掌握" : known ? "学习中" : "未掌握",
        }),
      },
      records: [...prev.records, { date: today, action: known ? "review-known" : "review-unknown", word: word.word, minutes: 1 }],
    }));
    notify(known ? "已安排下次复习" : "明天继续复习");
  }

  function navigate(next: Page) {
    if (!detail) setScrollPosition(`list:${page}`, window.scrollY);
    setDetail(null);
    setPage(next);
    window.setTimeout(() => window.scrollTo({ top: getScrollPosition(`list:${next}`), behavior: "auto" }), 30);
  }

  const content = detail ? (
    <DetailPage
      word={detail}
      favorite={Boolean(state.favorites[detail.word])}
      record={state.favorites[detail.word]}
      onBack={closeDetail}
      onToggle={toggleFavorite}
      onReview={markReview}
    />
  ) : (
    <main className="page-motion">
      {page === "dashboard" && (
        <Dashboard
          today={today}
          goal={state.settings.dailyGoal}
          learnedToday={learnedToday}
          dueCount={dueWords.length}
          favoriteCount={favorites.length}
          streak={streak}
          records={state.records}
          onStart={() => navigate("learn")}
        />
      )}
      {page === "search" && <SearchPage favorites={state.favorites} onToggle={toggleFavorite} onDetail={(w) => openDetail(w, "search")} />}
      {page === "learn" && (
        <LearnPage
          state={state}
          setState={setState}
          favorites={state.favorites}
          onToggle={toggleFavorite}
          onDetail={(w) => openDetail(w, "learn")}
        />
      )}
      {page === "favorites" && (
        <FavoritesPage words={favorites} onToggle={toggleFavorite} onDetail={(w) => openDetail(w, "favorites")} onReview={startSingleReview} />
      )}
      {page === "review" && <ReviewPage words={dueWords} onDetail={(w) => openDetail(w, "review")} onReview={markReview} />}
      {page === "records" && <RecordsPage records={state.records} />}
      {page === "plan" && <PlanPage words={favorites} />}
      {page === "library" && (
        <LibraryPage favorites={state.favorites} onToggle={toggleFavorite} onDetail={(w) => openDetail(w, "library")} />
      )}
      {page === "settings" && <SettingsPage settings={state.settings} setState={setState} />}
    </main>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">CET-4 Focus<span>四级智能背词助手</span></div>
        <nav>
          {navItems.map((item) => (
            <button key={item.page} className={page === item.page && !detail ? "active" : ""} onClick={() => navigate(item.page)} data-nav={item.page}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="shell">{content}</section>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button key={item.page} className={page === item.page && !detail ? "active" : ""} onClick={() => navigate(item.page)} data-nav={item.page}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ProgressRing({ pct, size = 120 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="progress-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(37,99,235,0.12)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 0.8s var(--ease-out-expo)" }} />
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6d5dfc"/><stop offset="100%" stopColor="#2563eb"/></linearGradient></defs>
      <text x={size/2} y={size/2 - 8} textAnchor="middle" className="ring-value">{pct}%</text>
      <text x={size/2} y={size/2 + 14} textAnchor="middle" className="ring-label">完成</text>
    </svg>
  );
}

function Dashboard(props: { today: string; goal: number; learnedToday: number; dueCount: number; favoriteCount: number; streak: number; records: StudyLog[]; onStart: () => void }) {
  const week = lastSevenDays(props.records);
  const pct = Math.min(100, Math.round((props.learnedToday / Math.max(props.goal, 1)) * 100));
  const maxCount = Math.max(1, ...week.map((item) => item.count));
  return (
    <>
      <header className="hero-card">
        <div>
          <p className="eyebrow">{formatFriendlyDate(props.today)}</p>
          <h1>CET-4 Focus</h1>
          <p>四级备考，轻一点开始。</p>
          {props.dueCount > 0 && (
            <button className="primary" style={{marginTop:14}} onClick={() => document.querySelector<HTMLButtonElement>('[data-nav="review"]')?.click()}>
              你有 {props.dueCount} 个单词待复习 →
            </button>
          )}
        </div>
        <ProgressRing pct={pct} />
      </header>
      <section className="stats-grid">
        <Stat title="今日已学" value={`${props.learnedToday}`} unit={`/ ${props.goal} 词`} />
        <Stat title="连续学习" value={`${props.streak}`} unit="天" />
        <Stat title="待复习" value={`${props.dueCount}`} unit="词" />
        <Stat title="生词本" value={`${props.favoriteCount}`} unit="词" />
      </section>
      <section className="card">
        <h2>最近 7 天</h2>
        <div className="bars">{week.map((item) => <div key={item.date}><span style={{ height: `${Math.max(12, Math.round((item.count / maxCount) * 145))}px` }} /><small>{item.date.slice(5)}</small></div>)}</div>
      </section>
      <div style={{textAlign:"center", marginTop:20}}>
        <button className="primary large" onClick={props.onStart}>开始今日学习</button>
      </div>
    </>
  );
}

function SearchPage({ favorites, onToggle, onDetail }: { favorites: Record<string, NormalizedWord>; onToggle: (word: NormalizedWord) => void; onDetail: (word: NormalizedWord) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<NormalizedWord | null>(null);
  const [related, setRelated] = useState<NormalizedWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("search_history") || "[]"); } catch { return []; }
  });

  function addHistory(word: string) {
    setHistory((prev) => {
      const next = [word, ...prev.filter((w) => w !== word)].slice(0, 12);
      localStorage.setItem("search_history", JSON.stringify(next));
      return next;
    });
  }

  async function search(word = query) {
    const text = word.trim().toLowerCase();
    if (!text) return;
    addHistory(text);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const online = await fetchOnlineDictionary(text);
      setResult(online);
      setRelated(relatedCet4Words(text).filter((item) => item.word.toLowerCase() !== online.word.toLowerCase()).map(normalizeWordData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败，请稍后重试。");
      setRelated(relatedCet4Words(text).map(normalizeWordData));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>查词</h1>
      <div className="search-panel">
        <Search size={19} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="输入任何英文单词..." />
        <button className="primary" onClick={() => search()}>查询</button>
      </div>
      {(history.length > 0 || !result) && <div className="chips">{["computer", "attention", "paradox", "strategy", "abuse", "important", "use", "flaw", ...history.filter(w => !["computer","attention","paradox","strategy","abuse","important","use","flaw"].includes(w))].slice(0,16).map((word) => <button key={word} onClick={() => { setQuery(word); search(word); }}>{word}</button>)}</div>}
      {loading && <div className="empty">正在查询可靠词典...</div>}
      {error && <div className="empty">{error}</div>}
      {result && <WordCard word={result} favorite={Boolean(favorites[result.word])} onToggleFavorite={onToggle} onDetail={onDetail} />}
      {related.length > 0 && <><h2>相关四级词</h2><div className="hscroll">{related.map((word) => <WordCard compact key={word.word} word={word} favorite={Boolean(favorites[word.word])} onToggleFavorite={onToggle} onDetail={onDetail} />)}</div></>}
    </section>
  );
}

function LearnPage({ state, setState, favorites, onToggle, onDetail }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; favorites: Record<string, NormalizedWord>; onToggle: (word: NormalizedWord) => void; onDetail: (word: NormalizedWord) => void }) {
  const [direction, setDirection] = useState<"left" | "right" | "">("");
  const [onlineWords, setOnlineWords] = useState<Record<string, NormalizedWord>>({});
  const [loadingWord, setLoadingWord] = useState("");
  const rawQueue = state.progress?.queue.length ? state.progress.queue : buildDailyQueue(state.settings.dailyGoal, favorites);
  const queue = rawQueue;
  const index = state.progress?.index || 0;
  const completed = queue.length === 0 || index >= queue.length;
  const currentWordId = completed ? "" : queue[index];
  const baseWord = normalizeWordData(currentWordId ? findCet4Word(currentWordId) || cet4Words[0] : cet4Words[0]);
  const word = onlineWords[baseWord.word] ? mergeWordData(baseWord, onlineWords[baseWord.word]) : baseWord;
  const isLoadingCurrent = loadingWord === baseWord.word;

  useEffect(() => {
    if (!state.progress) {
      setState((prev) => ({ ...prev, progress: { queue, index: 0, known: [], unknown: [], startedAt: new Date().toISOString(), mode: "daily" } }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (completed) return;
    const wordsToLoad = queue.slice(index, index + 4).filter(Boolean);
    async function loadWord(target: string, visible: boolean) {
      if (!target || onlineWords[target]) return;
      if (visible) setLoadingWord(target);
      try {
        const online = await fetchOnlineDictionary(target);
        if (!cancelled) {
          setOnlineWords((prev) => ({ ...prev, [target]: online }));
        }
      } catch {
        // 在线词典失败时保留本地四级数据，页面不阻塞。
      } finally {
        if (!cancelled && visible) setLoadingWord("");
      }
    }
    loadWord(baseWord.word, true);
    wordsToLoad.slice(1).forEach((target) => loadWord(target, false));
    return () => {
      cancelled = true;
    };
  }, [baseWord.word, completed, index, queue.join("|")]);

  function startNewRound(excludedWords: string[] = []) {
    const nextQueue = buildDailyQueue(state.settings.dailyGoal, favorites, excludedWords);
    setDirection("");
    setState((prev) => ({
      ...prev,
      progress: { queue: nextQueue, index: 0, known: [], unknown: [], startedAt: new Date().toISOString(), mode: "daily" },
    }));
  }

  function answer(known: boolean) {
    setDirection(known ? "right" : "left");
    window.setTimeout(() => {
      const unknownFavorite = withReviewDefaults(word);
      setState((prev) => ({
        ...prev,
        favorites: known ? prev.favorites : { ...prev.favorites, [word.word]: { ...(prev.favorites[word.word] || {}), ...unknownFavorite } },
        progress: {
          queue,
          index: Math.min(index + 1, queue.length),
          known: known ? [...(prev.progress?.known || []), word.word] : prev.progress?.known || [],
          unknown: known ? prev.progress?.unknown || [] : [...(prev.progress?.unknown || []), word.word],
          startedAt: prev.progress?.startedAt || new Date().toISOString(),
          mode: "daily",
        },
        records: [...prev.records, { date: getTodayDate(), action: known ? "learn-known" : "learn-unknown", word: word.word, minutes: 1 }],
      }));
      setDirection("");
    }, 180);
  }

  function skip() {
    setDirection("right");
    window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        progress: {
          queue,
          index: Math.min(index + 1, queue.length),
          known: prev.progress?.known || [],
          unknown: prev.progress?.unknown || [],
          startedAt: prev.progress?.startedAt || new Date().toISOString(),
          mode: "daily",
        },
      }));
      setDirection("");
    }, 180);
  }

  if (completed) {
    const knownCount = state.progress?.known.length || 0;
    const unknownCount = state.progress?.unknown.length || 0;
    return (
      <section className="completion-card card center">
        <div className="completion-badge">完成</div>
        <h1>今日学习完成</h1>
        <p>本组已完成 {queue.length} 个四级词，可以继续下一组，也可以重新开始。</p>
        <div className="completion-stats">
          <Stat title="认识" value={`${knownCount}`} unit="词" />
          <Stat title="不认识" value={`${unknownCount}`} unit="词" />
          <Stat title="本组总数" value={`${queue.length}`} unit="词" />
        </div>
        <div className="button-row fixed-actions">
          <button className="primary" onClick={() => startNewRound(queue)}>继续下一组</button>
          <button className="secondary" onClick={() => startNewRound()}>重新开始</button>
        </div>
      </section>
    );
  }

  return (
    <section className="learn-section">
      <div className="learn-top">
        <span>{index + 1} / {queue.length}</span>
        <div className="learn-progress-mini"><span style={{ width: `${((index + 1) / Math.max(queue.length, 1)) * 100}%` }} /></div>
        <button className="ghost" onClick={() => startNewRound()}><RotateCcw size={14} /> 重新开始</button>
      </div>
      <article className={`study-card ${direction ? `slide-${direction}` : ""}`}>
        {direction && <div className={`feedback-flash ${direction === "right" ? "known" : "unknown"}`}>{direction === "right" ? "✓" : "✗"}</div>}
        <button type="button" className="corner-star-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(word); }} title={favorites[word.word] ? "取消收藏" : "收藏"}>
          <Star size={22} fill={favorites[word.word] ? "#fbbf24" : "none"} color={favorites[word.word] ? "#fbbf24" : "#9ca3af"} />
        </button>
<h1>{word.word}</h1>
        <div className="study-pronounce">
          <Phonetics word={word} loading={isLoadingCurrent} />
          <button className="speak-pill" onClick={() => speak(word.word)} aria-label={`朗读 ${word.word}`}>
            <Volume2 size={17} /> 朗读单词
          </button>
        </div>
        <WordTags word={word} />
        <WordBody word={word} loading={isLoadingCurrent} />
        <div className="button-row study-actions">
          <button className="secondary danger" onClick={() => answer(false)}>不认识</button>
          <button className="primary success" onClick={() => answer(true)}>认识了</button>
        </div>
      </article>
    </section>
  );
}

function ReviewCard({ word, onSelect }: { word: NormalizedWord; onSelect: (word: NormalizedWord) => void }) {
  return (
    <article className="review-card" onClick={() => onSelect(word)}>
      <h3>{word.word}</h3>
      <Phonetics word={word} />
      {word.masteryStatus && <span className="tag">{word.masteryStatus}</span>}
      <p className="muted" style={{fontSize:12,marginTop:6}}>点击查看释义</p>
    </article>
  );
}

function ReviewDetailModal({
  word,
  onClose,
  onDetail,
  onReview,
}: {
  word: NormalizedWord;
  onClose: () => void;
  onDetail: (word: NormalizedWord) => void;
  onReview: (word: NormalizedWord, known: boolean) => void;
}) {
  return createPortal(
    <div className="review-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="review-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="review-close" onClick={onClose} aria-label="关闭释义弹窗">×</button>
        <div className="review-handle" />
        <h2>{word.word}</h2>
        <Phonetics word={word} />
        <WordBody word={word} />
        <div className="button-row">
          <button className="secondary danger" onClick={() => { onReview(word, false); onClose(); }}>不认识</button>
          <button className="primary success" onClick={() => { onReview(word, true); onClose(); }}>认识</button>
          <button className="secondary" onClick={() => { onClose(); onDetail(word); }}>详情</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReviewPage({ words, onDetail, onReview }: { words: NormalizedWord[]; onDetail: (word: NormalizedWord) => void; onReview: (word: NormalizedWord, known: boolean) => void }) {
  const [selected, setSelected] = useState<NormalizedWord | null>(null);
  return (
    <section>
      <h1>今日复习</h1>
      <p className="muted">{getTodayDate()} · 待复习 {words.length} 词</p>
      {words.length === 0 ? (
        <div className="empty">今天没有待复习单词，继续学习新单词吧。</div>
      ) : (
        <div className="review-grid">
          {words.map((word) => <ReviewCard key={word.word} word={word} onSelect={setSelected} />)}
        </div>
      )}
      {selected && (
        <ReviewDetailModal
          word={selected}
          onClose={() => setSelected(null)}
          onDetail={onDetail}
          onReview={onReview}
        />
      )}
    </section>
  );
}

function useAlphabetGroups(words: NormalizedWord[]) {
  return useMemo(() => {
    const map: Record<string, NormalizedWord[]> = {};
    for (const word of words) {
      const letter = /^[a-z]/i.test(word.word) ? word.word[0].toUpperCase() : "#";
      if (!map[letter]) map[letter] = [];
      map[letter].push(word);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [words]);
}

function DotTags({ word }: { word: NormalizedWord }) {
  return (
    <span className="word-dots">
      {word.isCET4 && <span className="dot cet" title="CET-4" />}
      {word.isHighFrequency && <span className="dot hot" title="高频" />}
      {word.isKeyWord && <span className="dot key" title="重点" />}
    </span>
  );
}


function AlphabetPicker({
  open,
  availableLetters,
  onSelect,
  onClose,
}: {
  open: boolean;
  availableLetters: string[];
  onSelect: (letter: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const available = new Set(availableLetters);

  return createPortal(
    <div className="alphabet-picker-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="alphabet-picker-panel" onClick={(event) => event.stopPropagation()}>
        <button className="alphabet-picker-close" onClick={onClose} aria-label="关闭首字母选择器">
          ×
        </button>
        <h2 className="alphabet-picker-title">选择首字母</h2>
        <p className="alphabet-picker-tip">点击字母后会跳转到对应分组</p>
        <div className="alphabet-picker-grid">
          {ALPHABET.map((letter) => {
            const disabled = !available.has(letter);
            return (
              <button
                key={letter}
                className="alphabet-picker-cell"
                disabled={disabled}
                onClick={() => !disabled && onSelect(letter)}
                aria-label={`跳转到 ${letter} 分组`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CompactCard({ word, favorite, onToggle, onDetail }: {
  word: NormalizedWord; favorite: boolean; onToggle: (word: NormalizedWord) => void; onDetail: (word: NormalizedWord) => void;
}) {
  return (
    <article className="compact-card" onClick={() => onDetail(word)}>
      <div className="compact-row">
        <span className="compact-word">{word.word}</span>
      </div>
      <p className="compact-meaning">{word.meanings[0]?.definitionZh || ""}</p>
      {(word.phoneticUK || word.phoneticUS) && <span className="compact-phonetic">/{word.phoneticUK || word.phoneticUS}/</span>}
      <button className="compact-fav" onClick={(e) => { e.stopPropagation(); onToggle(word); }} title={favorite ? "取消收藏" : "收藏"}>
        <Star size={16} fill={favorite ? "#fbbf24" : "none"} color={favorite ? "#fbbf24" : "#9ca3af"} />
      </button>
    </article>
  );
}

let _cachedLight: NormalizedWord[] | null = null;
function getLibraryWords(): NormalizedWord[] {
  if (!_cachedLight) {
    _cachedLight = cet4Words.map((w) => ({
      ...w,
      examples: [{ en: EMPTY_EXAMPLE, zh: EMPTY_TRANSLATION, source: "none" as const }],
      addedAt: "", learnedAt: "", lastReviewDate: "", nextReviewDate: "",
      reviewCount: 0, wrongCount: 0,
      masteryStatus: "未掌握" as const,
      source: "local" as const,
    }));
  }
  return _cachedLight;
}

let _libVisibleCount = 0;
let _favVisibleCount = 0;

function useLazyGroups(groups: [string, NormalizedWord[]][], batchSize = 2, cacheKey = "lib") {
  const initial = cacheKey === "fav" ? Math.max(batchSize, _favVisibleCount) : Math.max(batchSize, _libVisibleCount);
  const [visible, setVisible] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cacheKey === "fav") _favVisibleCount = Math.max(_favVisibleCount, visible);
    else _libVisibleCount = Math.max(_libVisibleCount, visible);
  }, [visible, cacheKey]);

  useEffect(() => {
    setVisible(batchSize);
  }, [groups]);

  useEffect(() => {
    if (visible >= groups.length) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible((v) => Math.min(v + batchSize, groups.length)); },
      { rootMargin: "600px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, groups.length, batchSize]);

  const shown = groups.slice(0, visible);
  const remaining = groups.length - visible;
  return { shown, remaining, sentinelRef, setVisible };
}

let _libActiveLetter = "ALL";

function LibraryPage({ favorites, onToggle, onDetail }: { favorites: Record<string, NormalizedWord>; onToggle: (word: NormalizedWord) => void; onDetail: (word: NormalizedWord) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const allWords = useMemo(() => getLibraryWords(), []);
  const filtered = useMemo(() => allWords.filter((word) => {
    if (query && !word.word.includes(query.toLowerCase()) && !word.meanings[0]?.definitionZh?.includes(query)) return false;
    if (filter === "高频词") return word.isHighFrequency;
    if (filter === "重点词") return word.isKeyWord;
    if (filter === "已掌握") return favorites[word.word]?.masteryStatus === "已掌握";
    if (filter === "未掌握") return favorites[word.word]?.masteryStatus !== "已掌握";
    if (filter === "收藏词") return Boolean(favorites[word.word]);
    return true;
  }), [allWords, query, filter, favorites]);
  	const groups = useAlphabetGroups(filtered);
	const [activeLetter, setActiveLetter] = useState(_libActiveLetter);
	const displayGroups = useMemo(() =>
	  activeLetter === "ALL" ? groups : groups.filter(([l]) => l === activeLetter),
	  [groups, activeLetter]
	);
	const { shown, remaining, sentinelRef } = useLazyGroups(displayGroups);
	const letters = groups.map(([l]) => l);

	const [pickerOpen, setPickerOpen] = useState(false);

	function selectLetter(letter: string) {
	  _libActiveLetter = letter;
	  setActiveLetter(letter);
	  setPickerOpen(false);
	  window.setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);
	}

	return (
	  <section className="lib-page">
	    <div className="lib-top">
	      <h1>词库</h1>
	      <div className="lib-search">
	        <Search size={16} />
	        <input placeholder="搜索单词..." value={query} onChange={(e) => setQuery(e.target.value)} />
	      </div>
	      <div className="segmented">{["全部", "高频词", "重点词", "未掌握", "已掌握", "收藏词"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
	      {letters.length > 1 && (
	        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,flexWrap:"wrap"}}>
	          <button className="secondary" onClick={() => setPickerOpen(true)}>
	            {activeLetter === "ALL" ? "按字母筛选" : `当前：${activeLetter}`}
	          </button>
	          {activeLetter !== "ALL" && (
	            <button className="secondary" onClick={() => selectLetter("ALL")}>显示全部</button>
	          )}
	        </div>
	      )}
	    </div>
	    <div className="lib-body" style={{marginTop:12}}>
	      <div className="lib-groups">
	        {shown.map(([letter, words]) => (
	          <div key={letter} className="lib-group">
	            <div className="lib-header">
	              <span className="lib-letter">{letter}</span><span>{words.length}词</span>
	            </div>
	            <div className="compact-grid">
	              {words.map((word) => <CompactCard key={word.word} word={word} favorite={Boolean(favorites[word.word])} onToggle={onToggle} onDetail={onDetail} />)}
	            </div>
	          </div>
	        ))}
	        {remaining > 0 && <div ref={sentinelRef} className="lib-placeholder" />}
	        {displayGroups.length === 0 && !query && <div className="empty">加载中...</div>}
	        {displayGroups.length === 0 && query && <div className="empty">没有匹配的单词</div>}
	      </div>
	    </div>
	    <AlphabetPicker
	      open={pickerOpen}
	      availableLetters={letters}
	      onSelect={selectLetter}
	      onClose={() => setPickerOpen(false)}
	    />
	  </section>
	);
}

function FavoritesPage({ words, onToggle, onDetail, onReview }: { words: NormalizedWord[]; onToggle: (word: NormalizedWord) => void; onDetail: (word: NormalizedWord) => void; onReview: (word: NormalizedWord) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const filtered = useMemo(() => words.filter((word) => {
    if (query && !word.word.includes(query.toLowerCase()) && !word.meanings[0]?.definitionZh?.includes(query)) return false;
    if (filter === "四级生词") return word.isCET4;
    if (filter === "高频词") return word.isHighFrequency;
    if (filter === "重点词") return word.isKeyWord;
    if (filter === "未掌握") return word.masteryStatus !== "已掌握";
    if (filter === "已掌握") return word.masteryStatus === "已掌握";
    return true;
  }), [words, query, filter]);
  const groups = useAlphabetGroups(filtered);
  const { shown, remaining, sentinelRef, setVisible } = useLazyGroups(groups);
  const letters = groups.map(([l]) => l);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  function scrollTo(letter: string) {
    const idx = groups.findIndex(([l]) => l === letter);
    if (idx >= 0 && idx >= shown.length) setVisible(idx + 1);
    setPickerOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = sectionRefs.current[letter];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  return (
    <section className="lib-page">
      <div className="lib-top">
        <h1>生词本</h1>
        <div className="lib-search">
          <Search size={16} />
          <input placeholder="搜索生词..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="segmented">{["全部", "四级生词", "高频词", "重点词", "未掌握", "已掌握"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>
      <div className="lib-body">
        <div className="lib-groups">
          {shown.map(([letter, words]) => (
            <div key={letter} ref={(el) => { sectionRefs.current[letter] = el; }} className="lib-group">
              <button type="button" className="lib-header" onClick={() => setPickerOpen(true)} aria-label={`打开首字母选择器，当前分组 ${letter}`}>
                <span className="lib-letter">{letter}</span><span>{words.length}词</span>
              </button>
              <div className="compact-grid">
                {words.map((word) => <CompactCard key={word.word} word={word} favorite={true} onToggle={onToggle} onDetail={onDetail} />)}
              </div>
            </div>
          ))}
          {remaining > 0 && <div ref={sentinelRef} className="lib-placeholder" />}
          {groups.length === 0 && <div className="empty">还没有收藏单词，去查询或学习时加入生词本吧。</div>}
        </div>
      </div>
      <AlphabetPicker
        open={pickerOpen}
        availableLetters={letters}
        onSelect={scrollTo}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  );
}

function DetailPage({ word, favorite, record, onBack, onToggle, onReview }: { word: NormalizedWord; favorite: boolean; record?: NormalizedWord; onBack: () => void; onToggle: (word: NormalizedWord) => void; onReview: (word: NormalizedWord, known: boolean) => void }) {
  const base = normalizeWordData({ ...word, ...(record || {}) });
  const [online, setOnline] = useState<NormalizedWord | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setOnline(null);
    setLoading(true);
    fetchOnlineDictionary(base.word)
      .then((result) => {
        if (!cancelled) setOnline(result);
      })
      .catch(() => {
        if (!cancelled) setOnline(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base.word]);
  const display = online ? mergeWordData(base, online) : base;
  return <main className="page-motion"><button className="ghost back" onClick={onBack}><ChevronLeft size={17} />返回</button><article className="detail-card"><div className="word-head"><div><h1>{display.word}</h1><Phonetics word={display} loading={loading} /></div><button className="icon-button" onClick={() => speak(display.word)}><Volume2 size={19} /></button></div><WordTags word={display} /><WordBody word={display} loading={loading} /><div className="meta-grid"><span>加入：{formatFriendlyDate(display.addedAt)}</span><span>上次：{formatFriendlyDate(display.lastReviewDate)}</span><span>下次：{formatFriendlyDate(display.nextReviewDate)}</span><span>状态：{display.masteryStatus}</span><span>复习：{display.reviewCount}</span><span>不认识：{display.wrongCount}</span></div><div className="button-row"><button className={favorite ? "secondary" : "primary"} onClick={() => onToggle(display)}>{favorite ? "已收藏 / 取消收藏" : "加入生词本"}</button>{favorite && <><button className="secondary" onClick={() => onReview(display, false)}>不认识</button><button className="primary" onClick={() => onReview(display, true)}>认识</button></>}</div></article></main>;
}

function RecordsPage({ records }: { records: StudyLog[] }) {
  const grouped = groupRecords(records);
  // Build 12-week heatmap data
  const weekData = useMemo(() => {
    const today = getTodayDate();
    const days: { date: string; count: number }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = addDays(today, -i);
      days.push({ date: d, count: records.filter((r) => r.date === d).length });
    }
    return days;
  }, [records]);
  function level(count: number) { return count === 0 ? "" : count <= 2 ? "l1" : count <= 5 ? "l2" : count <= 10 ? "l3" : "l4"; }
  return (
    <section>
      <h1>学习记录</h1>
      <div className="stats-grid">
        <Stat title="学习词数" value={`${records.filter((r) => r.action.startsWith("learn")).length}`} unit="词" />
        <Stat title="复习词数" value={`${records.filter((r) => r.action.startsWith("review")).length}`} unit="词" />
        <Stat title="收藏词数" value={`${records.filter((r) => r.action === "favorite").length}`} unit="词" />
      </div>
      <div className="card">
        <h2>学习热力图</h2>
        <div className="heatmap">{weekData.map((d) => <span key={d.date} className={`heatmap-cell ${level(d.count)}`} title={`${d.date}: ${d.count}条记录`} />)}</div>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <div className="empty">暂无学习记录。</div>
      ) : (
        Object.entries(grouped).slice(0, 30).map(([date, items]) => (
          <details className="record-card" key={date} open>
            <summary>{date} · {items.length} 条记录</summary>
            <div className="chips">{items.map((item, index) => <span key={index}>{item.word} · {item.action}</span>)}</div>
          </details>
        ))
      )}
    </section>
  );
}

function PlanPage({ words }: { words: NormalizedWord[] }) {
  const groups = planGroups(words);
  return (
    <section>
      <h1>复习计划</h1>
      <div className="timeline">
        {groups.map((group) => (
          <article className="plan-card" key={group.title}>
            <h3>
              {group.title}
              {group.title === "今天" && group.words.length > 0 && <span className="plan-badge">{group.words.length}词待复习</span>}
            </h3>
            {group.words.length ? (
              <div className="chips">{group.words.map((word) => <span key={word.word}>{word.word}</span>)}</div>
            ) : (
              <p className="muted">暂无安排</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsPage({ settings, setState }: { settings: AppState["settings"]; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const favs = loadFavorites();
  const mastered = Object.values(favs).filter((w: NormalizedWord) => w.masteryStatus === "已掌握").length;
  const records = loadRecords();
  const streak = computeStreak(records);
  const earned = (() => {
    const badges = [];
    if (streak >= 7) badges.push({ icon: "🔥", label: "连续 7 天", earned: true });
    else badges.push({ icon: "🔥", label: "连续 7 天", earned: false });
    if (streak >= 30) badges.push({ icon: "⚡", label: "连续 30 天", earned: true });
    else badges.push({ icon: "⚡", label: "连续 30 天", earned: false });
    if (mastered >= 100) badges.push({ icon: "🎯", label: "掌握 100 词", earned: true });
    else badges.push({ icon: "🎯", label: "掌握 100 词", earned: false });
    if (mastered >= 500) badges.push({ icon: "🏆", label: "掌握 500 词", earned: true });
    else badges.push({ icon: "🏆", label: "掌握 500 词", earned: false });
    return badges;
  })();
  return (
    <section>
      <h1>我的</h1>
      <article className="profile-card">
        <div className="avatar">四</div>
        <div>
          <h2>努力学习的同学</h2>
          <p>坚持四级备考，今天也轻一点开始。</p>
        </div>
      </article>
      <article className="card">
        <h2>学习勋章</h2>
        <div className="badges">
          {earned.map((b, i) => (
            <div key={i} className={`badge-item ${b.earned ? "earned" : "locked"}`}>
              <span className="badge-icon">{b.icon}</span> {b.label}
            </div>
          ))}
        </div>
      </article>
      <article className="card">
        <h2>学习设置</h2>
        <label className="setting-row">
          今日目标：{settings.dailyGoal} 词
          <input type="range" className="goal-slider" min={10} max={80} step={5} value={settings.dailyGoal} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, dailyGoal: Number(e.target.value) || 30 } }))} />
        </label>
        <p className="muted">PWA 已启用，可添加到手机主屏幕。</p>
      </article>
    </section>
  );
}

function Stat({ title, value, unit }: { title: string; value: string; unit: string }) {
  return <article className="stat-card"><span>{title}</span><strong>{value}<small>{unit}</small></strong></article>;
}

function buildDailyQueue(goal: number, favorites: Record<string, NormalizedWord>, excludedWords: string[] = []) {
  const favoriteSet = new Set(Object.keys(favorites));
  const excludedSet = new Set(excludedWords);
  const sorted = [...cet4Words].sort((a, b) => Number(b.isHighFrequency) - Number(a.isHighFrequency) || Number(b.isKeyWord) - Number(a.isKeyWord));
  const primary = sorted.filter((word) => !favoriteSet.has(word.word) && !excludedSet.has(word.word));
  const fallback = sorted.filter((word) => !favoriteSet.has(word.word) && excludedSet.has(word.word));
  return [...primary, ...fallback]
    .slice(0, goal)
    .map((word) => word.word);
}

function computeStreak(records: StudyLog[]) {
  let streak = 0;
  let date = getTodayDate();
  const dates = new Set(records.map((record) => record.date));
  if (!dates.has(date)) date = addDays(date, -1);
  while (dates.has(date)) {
    streak += 1;
    date = addDays(date, -1);
  }
  return streak;
}

function lastSevenDays(records: StudyLog[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(getTodayDate(), index - 6);
    return { date, count: records.filter((record) => record.date === date).length };
  });
}

function groupRecords(records: StudyLog[]) {
  return records.reduce<Record<string, StudyLog[]>>((acc, item) => {
    acc[item.date] = [...(acc[item.date] || []), item];
    return acc;
  }, {});
}

function planGroups(words: NormalizedWord[]) {
  const today = getTodayDate();
  const tomorrow = addDays(today, 1);
  const day3 = addDays(today, 3);
  const day7 = addDays(today, 7);
  return [
    { title: "今天", words: words.filter((word) => compareDate(word.nextReviewDate, today) <= 0) },
    { title: "明天", words: words.filter((word) => word.nextReviewDate === tomorrow) },
    { title: "3 天后", words: words.filter((word) => word.nextReviewDate > tomorrow && compareDate(word.nextReviewDate, day3) <= 0) },
    { title: "7 天后", words: words.filter((word) => word.nextReviewDate > day3 && compareDate(word.nextReviewDate, day7) <= 0) },
    { title: "更久以后", words: words.filter((word) => compareDate(word.nextReviewDate, day7) > 0) },
  ];
}
