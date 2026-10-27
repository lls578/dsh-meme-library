# 数据说明

`memes.db` 是 [cnmeme.wiki](https://cnmeme.wiki) 公开只读接口的词条快照：

- 接口：`GET https://cnmeme.wiki/api/v1/public/memes?q=&limit=&offset=`、`GET https://cnmeme.wiki/api/v1/public/memes/{slug}`
- 构建时间：2026-10-26 19:07:22（取自 `memes.db` 的 `meta.built_at`）
- 条数：6668
- 表结构：`memes(title, slug, tags, usage, origin, other, summary)`、`meta(key, value)`

本插件只做**本地缓存与检索**，不修改词条内容；查询结果会带上 `https://cnmeme.wiki/meme/{slug}` 来源链接。

**词条版权归 cnmeme.wiki 及原作者所有**；快照的再分发若与站点规则冲突，请以站点说明为准，或自行跑 `scripts/sync.py` 重新生成。

`scripts/sync.py` / `scripts/pack_data.py` 改写自 [in1t1a1/astrbot_plugin_memewiki](https://github.com/in1t1a1/astrbot_plugin_memewiki)（MIT License）。
