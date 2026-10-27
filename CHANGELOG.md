# Changelog

## 0.1.0 (2026-10-27)

- 首个版本：内置 6668 条梗库（cnmeme.wiki 快照，SQLite）
- 4 个工具：`meme_lookup` / `meme_guess` / `meme_add` / `meme_stats`
- 「先接梗再解释」：默认只返回用法，`explain: true` 才给出来源
- 自定义黑话单独存储，更新词库不覆盖
- 兼容 schemastery volatile 配置访问器；无 `node:sqlite` 时给出明确错误
- 附带 `scripts/sync.py` + `scripts/pack_data.py`（增量更新，MIT，改编自 astrbot_plugin_memewiki）
