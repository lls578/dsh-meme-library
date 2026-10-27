# dsh-meme-library

DSH（DeepSeek Harness）插件：**梗库**。给模型一个本地梗库，遇到不懂的新梗 / 缩写 / 群内黑话时先查再答，而不是硬猜或编一个"听起来很像那么回事"的解释。

内置 **6668 条**词条（`data/memes.db`，约 16MB 的 SQLite 快照），查询 **1–3ms**；自定义黑话单独存，更新词库不会覆盖。

## 工具

| 工具 | 作用 |
|---|---|
| `meme_lookup` | 查梗：精确 → 前缀 → 包含 → 标签 → 自定义黑话；默认给「怎么用/怎么接」，`explain: true` 才给出处 |
| `meme_guess` | 从一段话/评论里识别出现的梗（最长匹配） |
| `meme_add` | 记一条自定义黑话（与内置词库分开存） |
| `meme_stats` | 看词库快照时间、收录条数、自定义条数 |

## 设计原则：先接梗，再解释

工具返回的顺序和提示都按这个来：

1. 命中词条时，**先按 `usage` 用一句接梗**（像本来就会），别上来讲典故
2. 只有对方明确问「这是什么梗 / 什么意思 / 出处」时，才用 `origin` 解释，一两句够
3. 查不到就**直说不知道**，不要把两个不相干的梗拼一起
4. 说话用短句，别用「首先/其次/希望对你有帮助」这类客服腔

## 安装

```powershell
# 本地目录
dsh plugin --profile desktop add link:C:\path\to\dsh-meme-library

# 发布到 npm / GitHub 后
dsh plugin --profile desktop add dsh-meme-library
```

装完重启 DSH（插件在 bundle 层组装）。

> 依赖 Node 内置 SQLite（`node:sqlite`，Node ≥ 22.5）。DSH 自带 Node 24，无需额外安装。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `dbPath` | 空 | 梗库 SQLite 路径（空 = 插件自带 `data/memes.db`） |
| `userTermsPath` | 空 | 自定义黑话 JSON（空 = `~/.dsh/meme-library/user_terms.json`） |
| `maxResults` | `5` | 单次最多返回几条 |

## 自检 / 测试

```powershell
node test/plugin.test.mjs
```

## 更新词库（可选）

内置词库是发布时的快照。想跟进新梗：

```bash
cd dsh-meme-library/scripts
python sync.py --data-dir ../data        # 增量抓取（默认 0.35s/次，遵守站点限速）
python pack_data.py --data-dir ../data   # 重建 memes.db
```

词条内容来自 [cnmeme.wiki](https://cnmeme.wiki) 公开只读接口（`GET /api/v1/public/memes`），本插件只做本地缓存与检索；词条版权归原站及原作者，检索结果保留来源链接。

`scripts/sync.py` / `scripts/pack_data.py` 改写自 [in1t1a1/astrbot_plugin_memewiki](https://github.com/in1t1a1/astrbot_plugin_memewiki)（MIT），感谢原作者。

## License

代码 MIT；词条数据版权归 cnmeme.wiki 及原作者（见 `data/README.md`）。
