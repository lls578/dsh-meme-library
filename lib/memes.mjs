/**
 * 梗库核心：SQLite 查询 + 自定义黑话。
 * 数据来自 cnmeme.wiki 公开接口的快照（memes.db），只读打开。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SOURCE_BASE = "https://cnmeme.wiki";

let DatabaseSync = null;
try {
  // Node 22.5+ / 24 内置 SQLite（无需第三方依赖）
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}

function short(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** 把「XX是什么梗 / 啥意思 / 出处」这类问法洗成核心词。 */
export function normalizeQuery(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^[「『"'"'《【\[（(]+/, "").replace(/[」』"'"'》】\]）)]+$/, "");
  s = s.replace(/^(?:那个|这个|请问|问一下|问下|求解|有人知道|有没有人知道|科普一下|搜一下|查一下)\s*/u, "");
  s = s.replace(/(?:是什么梗|是啥梗|什么梗|啥意思|是什么意思|什么意思啊|什么意思|的梗吗|的梗|的出处|出处是什么|来源是什么|怎么用|咋用)\s*[?？!！。]*$/u, "");
  s = s.replace(/[?？!！。，,、；;：:]+$/u, "");
  return s.trim();
}

export function createMemeStore({ dbPath, userTermsPath, maxResults = 5 }) {
  let db = null;
  let titles = null;
  let custom = null;
  let meta = null;

  function ensureDb() {
    if (db) return db;
    if (!DatabaseSync) throw new Error("当前 Node 没有 node:sqlite，无法查询梗库（需要 Node 22.5+）");
    if (!existsSync(dbPath)) throw new Error(`梗库文件不存在：${dbPath}`);
    db = new DatabaseSync(dbPath, { readOnly: true });
    return db;
  }

  function all(sql, ...params) {
    return ensureDb().prepare(sql).all(...params);
  }

  function getMeta() {
    if (meta) return meta;
    meta = {};
    try {
      for (const row of all("SELECT key, value FROM meta")) meta[row.key] = row.value;
    } catch {
      /* meta 表可能不存在 */
    }
    return meta;
  }

  function loadTitles() {
    if (titles) return titles;
    titles = all("SELECT title, slug FROM memes").map((r) => ({ title: r.title, slug: r.slug }));
    return titles;
  }

  function loadCustom() {
    if (custom) return custom;
    custom = {};
    try {
      if (existsSync(userTermsPath)) {
        custom = JSON.parse(readFileSync(userTermsPath, "utf8")) || {};
      }
    } catch {
      custom = {};
    }
    return custom;
  }

  function saveCustom() {
    mkdirSync(dirname(userTermsPath), { recursive: true });
    const tmp = userTermsPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(custom, null, 2), "utf8");
    renameSync(tmp, userTermsPath);
  }

  function sourceUrl(slug) {
    return `${SOURCE_BASE}/meme/${encodeURIComponent(slug || "")}`;
  }

  function rowOut(row, score) {
    return {
      title: row.title,
      tags: row.tags || "",
      usage: short(row.usage, 260),
      origin: short(row.origin, 420),
      summary: short(row.summary, 200),
      source_url: sourceUrl(row.slug),
      score,
    };
  }

  /** 查梗：精确 → 前缀 → 包含 → 标签 → 自定义黑话。 */
  function lookup(raw, { explain = false } = {}) {
    const q = normalizeQuery(raw);
    if (!q) return { ok: false, error: "关键词为空" };

    const want = Math.max(1, Math.min(10, maxResults));
    const seen = new Set();
    const results = [];
    const push = (row, score) => {
      if (!row || !row.title || seen.has(row.title)) return;
      seen.add(row.title);
      results.push(rowOut(row, score));
    };

    for (const row of all("SELECT * FROM memes WHERE title = ? OR slug = ? LIMIT 1", q, q)) push(row, 120);
    for (const row of all("SELECT * FROM memes WHERE title LIKE ? ORDER BY length(title) LIMIT ?", q + "%", want)) push(row, 100);
    for (const row of all("SELECT * FROM memes WHERE title LIKE ? ORDER BY length(title) LIMIT ?", "%" + q + "%", want)) push(row, 80);
    for (const row of all("SELECT * FROM memes WHERE tags LIKE ? ORDER BY length(title) LIMIT ?", "%" + q + "%", want)) push(row, 50);

    for (const [name, term] of Object.entries(loadCustom())) {
      const hit = name === q || name.includes(q) || q.includes(name);
      if (!hit) continue;
      if (results.some((r) => r.title === name)) continue;
      results.push({
        title: name,
        tags: term.tags || "自定义黑话",
        usage: short(term.usage || term.meaning || "", 260),
        origin: short(term.meaning || "", 420),
        summary: "自定义黑话（本地）",
        source_url: "",
        score: name === q ? 130 : 90,
      });
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, want);
    return {
      ok: true,
      query: q,
      count: top.length,
      results: top.map((r) => (explain ? r : { ...r, origin: undefined, summary: undefined })),
      reply_hint:
        top.length > 0
          ? "先按 results[0].usage 里的一句接梗（像本来就会）；只有对方明确问出处/什么意思，才用 origin 解释，一两句就够。"
          : "词库没收录。不要硬编：可以直说不知道/反问这是什么梗，或用 meme_add 记成自定义黑话。",
    };
  }

  /** 从一段话里找出可能出现的梗（最长匹配优先）。 */
  function guess(text) {
    const src = String(text ?? "");
    if (!src.trim()) return { ok: false, error: "text 为空" };

    const hits = [];
    for (const item of loadTitles()) {
      const t = item.title;
      if (t.length >= 2 && t.length <= 10 && src.includes(t)) hits.push(item);
    }
    for (const name of Object.keys(loadCustom())) {
      if (name.length >= 2 && src.includes(name)) hits.push({ title: name, slug: "" });
    }
    hits.sort((a, b) => b.title.length - a.title.length);

    const out = [];
    const seen = new Set();
    for (const hit of hits) {
      if (seen.has(hit.title)) continue;
      seen.add(hit.title);
      let row = null;
      try {
        row = hit.slug
          ? all("SELECT * FROM memes WHERE title = ? LIMIT 1", hit.title)[0]
          : null;
      } catch {
        row = null;
      }
      if (row) out.push(rowOut(row, 100));
      else {
        const term = loadCustom()[hit.title];
        if (term) {
          out.push({
            title: hit.title,
            tags: term.tags || "自定义黑话",
            usage: short(term.usage || term.meaning || "", 260),
            origin: short(term.meaning || "", 420),
            summary: "自定义黑话（本地）",
            source_url: "",
            score: 100,
          });
        }
      }
      if (out.length >= 5) break;
    }

    return {
      ok: true,
      found: out.length,
      results: out,
      reply_hint:
        out.length > 0
          ? "这段话里有梗被识别到了：先接梗（usage），别科普；对方追问再解释。"
          : "没识别到已知的梗（也可能就是正常说话，别硬接）。",
    };
  }

  /** 记一条自定义黑话。 */
  function add({ name: rawName, meaning, tags, usage }) {
    const name = String(rawName ?? "").trim();
    const mean = String(meaning ?? "").trim();
    if (!name || !mean) return { ok: false, error: "name 和 meaning 都必填" };
    if (name.length > 40) return { ok: false, error: "name 太长（最多 40 字）" };
    loadCustom();
    custom[name] = {
      meaning: mean,
      tags: tags ? String(tags).trim() : "自定义黑话",
      usage: usage ? String(usage).trim() : mean,
      added: new Date().toISOString(),
    };
    saveCustom();
    return { ok: true, name, custom_count: Object.keys(custom).length, path: userTermsPath };
  }

  function stats() {
    let count = null;
    try {
      count = all("SELECT COUNT(*) AS c FROM memes")[0]?.c ?? null;
    } catch {
      count = null;
    }
    const m = getMeta();
    return {
      ok: true,
      built_at: m.built_at || "",
      snapshot_count: m.count || (count != null ? String(count) : ""),
      custom_count: Object.keys(loadCustom()).length,
      db_path: dbPath,
      user_terms_path: userTermsPath,
      source: SOURCE_BASE,
      note: "梗库为 cnmeme.wiki 公开接口快照；自定义黑话单独存，不会被更新覆盖。",
    };
  }

  return { lookup, guess, add, stats };
}
