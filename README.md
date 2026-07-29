# 断料雷达 · BOM Shockwave

一颗料缺货，30 秒看清打击面，以及该给每个部门发什么指令。

这是一个浏览器本地运行的 BOM 缺料冲击推演器：导入多层 BOM、库存、到货计划与产线
周计划，执行确定性 MRP 展开与到货批次分配，输出冲击图、产线计划 delta、参数化
Playbook，以及采购 / 产线 / 仓库 / 计划四类可复制指令。

## 本地运行

```bash
npm install
npm run dev
```

验证：

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

## 产品边界

- 无后端、数据库、账号、API key 或运行时 LLM；
- CSV 只读入当前浏览器内存，不上传、不持久化；
- 所有数量、日期、净缺口、延期与选项排序由 TypeScript 纯函数计算；
- 指令自然语言由固定模板消费计算结果，不允许 LLM 创造策略或数字；
- 内置数据由 `src/lib/demoFactory.ts` 程序生成，不含任何真实公司数据；
- v0.1 不做需求预测、精细产能排程、HR 排班或多工厂。

详细操作见 [`docs/user-manual.md`](docs/user-manual.md)；比赛提交材料草稿见
[`docs/submission-draft.md`](docs/submission-draft.md)。

