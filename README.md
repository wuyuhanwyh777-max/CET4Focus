# CET-4 Focus 四级智能背词助手 V2

这是一个重新设计开发的 React + Vite + TypeScript Web App / PWA，用于四级单词学习、普通英文查词、生词本、每日复习、学习记录和复习计划。

## 运行方式

在项目目录运行：

```bash
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:5173
```

手机同一 Wi-Fi 访问：

```bash
npm run dev -- --host 0.0.0.0
```

然后在手机浏览器打开：

```text
http://电脑局域网IP:5173
```

## 添加到手机主屏幕

项目已包含 `manifest.json` 和 `service worker`。用手机浏览器打开本地服务地址后：

- iPhone Safari：分享按钮 -> 添加到主屏幕
- Android Chrome：菜单 -> 添加到主屏幕

## 目录说明

- `src/App.tsx`：主要页面、导航、学习、复习、查询和详情交互。
- `src/styles.css`：苹果风 UI、响应式布局、卡片和动画。
- `src/types.ts`：统一单词、学习记录和应用状态类型。
- `src/utils/normalize.ts`：`normalizeWordData()`，统一本地词库、在线词典、缓存、生词本和旧数据结构。
- `src/utils/storage.ts`：localStorage 安全读写封装。
- `src/utils/date.ts`：日期工具，统一 `YYYY-MM-DD`。
- `src/services/dictionary.ts`：在线词典查询、翻译查询和缓存。
- `src/data/cet4Words.ts`：本地四级词库示例数据和标签。
- `public/manifest.json`、`public/sw.js`：PWA 支持。

## 在线词典

查词优先查询用户输入的单词本身。本地四级词库只补充 CET-4 / 高频 / 重点标签，不限制普通英文查词。

当前使用：

- `https://api.dictionaryapi.dev/api/v2/entries/en/{word}` 获取英文释义、音标、英文例句。
- `https://api.mymemory.translated.net/get` 尝试获取中文释义和例句翻译。

如果接口没有可靠例句或翻译，页面显示“暂无可靠例句 / 暂无可靠翻译”，不会编造内容。

## localStorage keys

- `dictionary_cache`：在线词典查询缓存。
- `cet4_words_cache`：预留的四级词库缓存。
- `favorite_words`：生词本，保存完整 normalize 后的单词对象。
- `learning_records`：学习、收藏、复习记录。
- `study_progress`：今日学习进度。
- `review_plan`：预留复习计划数据。
- `scroll_positions`：列表返回详情时的滚动位置。
- `app_settings`：学习目标等设置。

## 复习规则

新加入生词本的词当天进入复习。

点击“认识”：

- 第 1 次：1 天后复习
- 第 2 次：3 天后复习
- 第 3 次：7 天后复习
- 之后：15 天后复习

点击“不认识”：

- `wrongCount + 1`
- 下次复习为明天
- 状态保持未掌握或学习中

## 扩展四级词库

继续编辑：

```text
src/data/cet4Words.ts
```

新增词条保持统一结构即可。没有可靠例句时请使用：

```ts
examples: [{ en: "暂无可靠例句", zh: "暂无可靠翻译", source: "none" }]
```

不要写模板例句或编造翻译。

## 建议测试

1. 搜索 `use`，确认优先显示 use。
2. 搜索 `computer`、`hyper`，确认非四级词可查。
3. 搜索 `important`，确认显示 CET-4 / 高频 / 重点标签。
4. 搜索 `asdfghjk`，确认显示未找到。
5. 加入生词本，刷新后确认不丢。
6. 今日学习背到第 3 个词，切换页面再返回，确认进度保留。
7. 今日复习点击认识/不认识，确认日期变化。
8. 词库长列表打开详情再返回，确认滚动位置恢复。
