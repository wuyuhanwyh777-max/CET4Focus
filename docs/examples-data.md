# CET4Focus 例句数据说明

## 例句优先级

页面显示例句时按以下顺序查找：

1. `wordExamples.ts` — 手工维护的高质量例句
2. `generatedExamples.json` — 脚本自动缓存
3. `cet4Words.ts` — 原词库 examples 字段
4. 在线 dictionaryService — Netlify Function 代理
5. 暂无可靠例句

## Tatoeba 本地句对

文件路径：`data/tatoeba-eng-cmn.tsv`

支持两种格式：
- 格式 A（2 列）：英文句子<TAB>中文句子
- 格式 B（官方导出）：id<TAB>lang<TAB>english<TAB>id2<TAB>lang<TAB>chinese

## 运行命令

```bash
npm run fill:examples -- --provider=tatoeba --limit=500
npm run fill:examples -- --provider=tatoeba --all
npm run fill:examples -- --provider=free --limit=100
npm run fill:examples -- --provider=mw --limit=100
```

## 注意事项

- generatedExamples.json 自动生成，不要手动编辑
- 环境变量写在 .env.local，不要提交
- 不要将 API Key 写死在代码中
