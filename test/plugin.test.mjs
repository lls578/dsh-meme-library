/**
 * 插件级测试：模拟 Cordis 上下文验证 4 个工具 + 真实梗库查询。
 * 运行：node test/plugin.test.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apply } from "../index.js";
import { normalizeQuery } from "../lib/memes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dbPath = join(HERE, "..", "data", "memes.db");
const tmp = mkdtempSync(join(tmpdir(), "dsh-meme-test-"));
const userTermsPath = join(tmp, "user_terms.json");

const tools = [];
const ctx = { tools: { register: (t) => (tools.push(t), t) }, logger: { info() {}, warn() {} } };
apply(ctx, { dbPath, userTermsPath, maxResults: 5 });

const names = tools.map((t) => t.name);
const expect = ["meme_add", "meme_guess", "meme_lookup", "meme_stats"];
console.log("[test] tools:", names.join(", "));
for (const n of expect) if (!names.includes(n)) throw new Error("missing tool: " + n);
if (names.length !== expect.length) throw new Error("unexpected tool count: " + names.length);

// schema 是被编译成 raw JSON Schema 的
for (const t of tools) {
  if (!t.parameters || t.parameters.type !== "object") throw new Error("bad parameters: " + t.name);
}
console.log("[test] parameters schema ok");

// 问法清洗
const norm = normalizeQuery("典是什么梗？");
if (norm !== "典") throw new Error("normalizeQuery failed: " + norm);
console.log("[test] normalize ok");

// 真实词库查询
const lookup = await tools.find((t) => t.name === "meme_lookup").execute({ keyword: "大水理论" });
if (!lookup.ok || lookup.count < 1) throw new Error("lookup failed: " + JSON.stringify(lookup).slice(0, 300));
console.log("[test] lookup ok:", lookup.results[0].title, "| tags:", lookup.results[0].tags.slice(0, 24));
if (lookup.results[0].origin !== undefined) throw new Error("默认不应返回 origin（先接梗再解释）");

const explain = await tools.find((t) => t.name === "meme_lookup").execute({ keyword: "大水理论", explain: true });
if (!explain.results[0].origin) throw new Error("explain=true 应返回 origin");
console.log("[test] explain ok");

// 识别梗
const guess = await tools.find((t) => t.name === "meme_guess").execute({ text: "这波纯纯的大水理论" });
if (!guess.ok) throw new Error("guess failed: " + JSON.stringify(guess).slice(0, 200));
console.log("[test] guess ok, found:", guess.found);

// 统计
const stats = await tools.find((t) => t.name === "meme_stats").execute({});
if (!stats.ok || String(stats.snapshot_count) !== "6668") throw new Error("stats failed: " + JSON.stringify(stats));
console.log("[test] stats ok:", stats.snapshot_count, "条");

// 自定义黑话
const add = await tools.find((t) => t.name === "meme_add").execute({ name: "测试黑话", meaning: "测试用含义" });
if (!add.ok) throw new Error("add failed: " + JSON.stringify(add));
const custom = await tools.find((t) => t.name === "meme_lookup").execute({ keyword: "测试黑话" });
if (!custom.ok || custom.count < 1) throw new Error("custom lookup failed");
console.log("[test] custom term ok");

rmSync(tmp, { recursive: true, force: true });
console.log("[test] ✅ all passed");
