/**
 * dsh-meme-library —— 梗库插件（host 半端）
 * 给模型 4 个工具：查梗 / 识别梗 / 加自定义黑话 / 统计。
 * 设计原则（学自 cnmeme 梗百科）：先接梗、再解释；查不到就说不知道，别硬编。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMemeStore } from "./lib/memes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = join(HERE, "data", "memes.db");

let defineTool = null;
let z = null;
try {
  const dt = await import("@deepseek-ai/dsh-tools");
  defineTool = dt.defineTool;
} catch {
  /* 用本地等价实现 */
}
try {
  const sm = await import("@deepseek-ai/schemastery");
  z = sm.default;
} catch {
  /* 没有 Config 也能跑 */
}

/** 把「属性名 → 值 schema」映射编译成 raw JSON Schema（与宿主 defineTool 行为一致）。 */
function compileParameters(spec) {
  const properties = {};
  const required = [];
  for (const [key, def] of Object.entries(spec || {})) {
    if (!def || typeof def !== "object") continue;
    if (def.required === true) required.push(key);
    const { required: _omit, ...rest } = def;
    properties[key] = rest;
  }
  const schema = { type: "object", properties };
  if (required.length) schema.required = required;
  return schema;
}

if (!defineTool) {
  defineTool = (options) => ({ ...options, parameters: compileParameters(options.parameters) });
}

function cfgGet(config, key, fallback) {
  const v = config ? config[key] : undefined;
  if (v && typeof v === "object") {
    if (typeof v.get === "function") {
      try {
        const got = v.get();
        return got === undefined || got === null ? fallback : got;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  return v === undefined || v === null ? fallback : v;
}

const TEXT_OUTPUT = {
  schema: { type: "object", properties: {}, additionalProperties: true },
  render: () => [],
};

export const name = "meme-library";
export const inject = ["tools"];

export const Config = !z
  ? undefined
  : z.object({
      dbPath: z.string().default("").description("梗库 SQLite 路径（空=插件自带 data/memes.db）").extra("volatile", true),
      userTermsPath: z.string().default("").description("自定义黑话 JSON 路径（空=~/.dsh/meme-library/user_terms.json）").extra("volatile", true),
      maxResults: z.natural().default(5).description("单次最多返回几条").extra("volatile", true),
    });

export function apply(ctx, config) {
  const dbPath = (() => {
    const p = cfgGet(config, "dbPath", "");
    return typeof p === "string" && p.trim() ? p : DEFAULT_DB;
  })();
  const userTermsPath = (() => {
    const p = cfgGet(config, "userTermsPath", "");
    if (typeof p === "string" && p.trim()) return p;
    const home = process.env.USERPROFILE || process.env.HOME || ".";
    return join(home, ".dsh", "meme-library", "user_terms.json");
  })();
  const maxResults = Number(cfgGet(config, "maxResults", 5)) || 5;

  const store = createMemeStore({ dbPath, userTermsPath, maxResults });
  if (!existsSync(dbPath)) {
    ctx.logger?.warn?.(`[meme-library] 梗库文件不存在：${dbPath}`);
  }

  const tool = (spec) =>
    ctx.tools.register(
      defineTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters || {},
        output: TEXT_OUTPUT,
        async execute(args) {
          try {
            return await spec.execute(args || {});
          } catch (e) {
            return { ok: false, error: String(e?.message || e) };
          }
        },
      }),
    );

  tool({
    name: "meme_lookup",
    description:
      "查网络新梗 / 缩写 / 群内黑话。用法：先把词丢进来查，命中就按 usage 用一句接梗（像本来就会），" +
      "只有对方明确问「这是什么梗/什么意思/出处」才解释 origin。查不到就直说不知道，别硬编。",
    parameters: {
      keyword: { type: "string", description: "要查的梗/缩写/黑话，可带「是什么梗」等问法", required: true },
      explain: { type: "boolean", description: "true=附带出处解释；默认只给「怎么用/怎么接」" },
    },
    execute: ({ keyword, explain }) => store.lookup(keyword, { explain: explain === true }),
  });

  tool({
    name: "meme_guess",
    description: "从一句话/一段评论里识别出可能出现的梗（最长匹配），用来判断对方是不是在抛梗。",
    parameters: {
      text: { type: "string", description: "要分析的一段话/评论", required: true },
    },
    execute: ({ text }) => store.guess(text),
  });

  tool({
    name: "meme_add",
    description: "记一条自定义黑话/群内梗（与内置词库分开存，更新词库不会覆盖）。不确定的梗先用 meme_lookup 查。",
    parameters: {
      name: { type: "string", description: "梗名称", required: true },
      meaning: { type: "string", description: "含义/用法解释", required: true },
      tags: { type: "string", description: "标签（可选）" },
      usage: { type: "string", description: "怎么用/怎么接（可选，默认同 meaning）" },
    },
    execute: (args) => store.add(args),
  });

  tool({
    name: "meme_stats",
    description: "看梗库状态：快照时间、收录条数、自定义黑话条数。",
    parameters: {},
    execute: () => store.stats(),
  });

  ctx.logger?.info?.(`[meme-library] 已加载，梗库：${dbPath}`);
}
