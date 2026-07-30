# PROJECT_STATE — 缺料冲击推演器

> Canonical handoff for `projects/bom-shockwave/`  
> Last writeback: 2026-07-30（Codex Desktop）

## Status

**COO_VALIDATED_PASS / CEO_DOMAIN_FEEDBACK_IMPLEMENTED / LOCAL_BROWSER_RECHECK_PENDING**

v0.1 核心流程、单测、文档、桌面 / 375px 浏览器验收与最终构建已全绿；COO 正式 Gate
维持 GO。CEO 07-30 选择正式产品名「缺料冲击推演器」，并指出原四部门指令缺少研发、
销售、物流闭环；三类指令已实现且通过代码门，待本地浏览器回归。未部署、未建远端、未
push、未提交比赛、未发帖。

## Implemented

- Vite + React 19 + TypeScript + Tailwind 静态工程；
- `@xyflow/react` 物料 → 成品工单 → 产线 → 客户传播图；
- 程序生成的合成工厂：24 个成品、8 个二级模组、2–3 层 BOM、共享阻容件；
- 多层 BOM where-used 展开、损耗率、共用件累计与循环引用防御；
- 现货 / 预留 / 到货批次的确定性分配，客户优先与交期优先两种规则；
- 到货日期编辑后净缺口、延期、图、甘特 delta、Playbook、指令全量即时重算；
- 催交 / 挪料 / 客户改承诺 / 替代料 / 提良率五类参数化选项；
- 替代料验证天数、成本、现场良率空间显式人工输入；
- 采购 / 产线 / 仓库 / 计划 / 研发 / 销售 / 物流七类模板指令，prompt + JSON 双格式；
- CSV 文件或粘贴导入，模糊列名、宽容单位 / 日期解析、坏行警告；
- 完整事件 JSON 导出；
- 用户手册与比赛提交草稿。

## Verification evidence

当前已执行：

```text
$ npm test
RUN  v4.1.10
Test Files  3 passed (3)
Tests       23 passed (23)

$ npm run lint
eslint . → exit 0

$ npm run build
vite v8.1.5
✓ 1727 modules transformed.
dist/index.html                   0.61 kB │ gzip:   0.43 kB
dist/assets/index-DRXqFdo0.css   39.94 kB │ gzip:   8.57 kB
dist/assets/index-R7DUFa65.js   411.92 kB │ gzip: 132.84 kB
✓ built in 128ms

$ npm audit --audit-level=high
found 0 vulnerabilities
```

`npm audit` 的成功结果来自本轮部门扩展前的同日验证；本轮未修改依赖清单。扩展后的复跑
因 Codex 审批服务额度不足，无法放行 npm registry 网络连接，未伪报新结果。

浏览器验收（Codex in-app Browser，本地 Vite）：

- 桌面首屏品牌、定位、双 CTA、雷达主视觉正常；控制台 0 error / 0 warn；
- 一键演示载入 24 张工单，默认事件摘要：净缺口 1,730 pcs / 受击成品 15 /
  4 条产线 / 6 个客户；
- 冲击图完整渲染物料 → 8 个首要成品工单 → 4 条产线 → 4 个客户节点；
- 日期控件触发即时重算；精确 `2026-08-19 → 2026-08-05` 的净缺口与延期代价下降
  由 `engine.test.ts` 实值断言覆盖；
- 采购 prompt 复制成功，剪贴板含料号、采购单、供应商、目标日期与最低数量；
- 完整事件 JSON 按标准 Blob + `<a download>` 链路触发；内置浏览器未暴露 Blob
  download 事件，但点击后控制台 0 error（同 `fapiao-cloud` 已知浏览器限制）；
- 375×812 首屏、工作台和数据台 `scrollWidth = innerWidth = 375`，无横向溢出；
- 375px 数据台显示 182 行 BOM / 6 行库存 / 3 行到货 / 24 张工单；示例 CSV
  点击后状态明确显示“已加入 2 行”。

07-30 品牌改名回归：

- 用户可见品牌从「断料雷达 · BOM Shockwave」统一改为「缺料冲击推演器」；
- 工程目录与 npm 包继续保留 `bom-shockwave`，避免无价值路径迁移；
- 桌面 1280px：页面标题、导航品牌、H1 均为新名称，`scrollWidth = innerWidth = 1280`；
- 375×812：导航品牌宽 184.85px，H1 右边界 357px，`scrollWidth = innerWidth = 375`；
- 一键演示后移动工作台仍无横向溢出，KPI 保持
  `1,730 pcs / 15 个成品 / 8月8日 / ¥26万`；
- 桌面与移动回归均为 0 console error / 0 warn；
- 回归工程门：20/20 tests、lint exit 0、Vite 8 build exit 0、audit 0 vulnerabilities。

07-30 CEO 部门闭环校准：

- 部门指令由 4 张扩展为 7 张，新增研发 / 销售 / 物流，继续保持 prompt + JSON 双格式；
- 研发卡消费人工输入的验证天数与预算，强制研发 / 质量共同签字，禁止未批准改 BOM；
- 销售卡携带客户、工单、预计完工日、延期天数和估算罚款，禁止承诺早于计划结果；
- 物流卡把供应商齐套、分批提货、在途、门岗、检验放行、入库串为完整到厂链；
- 新增 3 个模板测试；最终代码门为 23/23 tests、lint exit 0、Vite 8 build exit 0；
- 桌面双列下第 7 张卡横跨整行；375px 仍使用单列规则；
- 本地 Vite 服务已停止，重新绑定 `127.0.0.1:5182` 被审批服务额度问题阻断，因此新增
  三张卡的浏览器回归明确标为 pending。

## Known boundaries

1. v0.1 是快速冲击推演，不是有限产能精排；甘特只表达物料导致的计划 delta。
2. 工单延期成本依赖导入的日罚款；缺失时按 0，不假造条款。
3. BOM 循环会被切断并由纯函数返回循环路径；v0.1 UI 未单列循环清单。
4. 数据仅保存在页面 state；刷新后消失，未提供导入会话恢复或逐批撤销。
5. 不向 ERP/MES 回写；行动回写闭环属于 9 月旗舰 roadmap。

## Next gates

1. 审批恢复后完成七张部门指令的桌面 / 375px 浏览器回归。
2. CEO 快速复核新增研发、销售、物流三张指令是否像真工厂。
3. CEO 选择部署平台，并补用户手册 / 提交草稿截图。
4. 部署、注册、提交与发帖只由 CEO 完成。

## Changed files

工程：`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig*.json`、
`eslint.config.js`、`index.html`、`.gitignore`  
应用：`src/**`  
文档：`README.md`、`docs/**`、本文件

writeback: [`projects/bom-shockwave/PROJECT_STATE.md`]
