import { startTransition, useDeferredValue, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Database,
  FileSpreadsheet,
  Gauge,
  Layers3,
  LockKeyhole,
  Network,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { ImpactGraph } from './components/ImpactGraph'
import {
  DEMO_DELAYED_SUPPLY,
  DEMO_FOCUS_MATERIAL,
  generateDemoFactory,
} from './lib/demoFactory'
import { analyzeShock, explodeProduct } from './lib/engine'
import {
  parseBomCsv,
  parseInventoryCsv,
  parseOrdersCsv,
  parseSupplyCsv,
} from './lib/csv'
import { formatShortDate } from './lib/date'
import type {
  DataKind,
  FactoryDataset,
  ImportWarning,
  Material,
  ScenarioParameters,
} from './types'

const EMPTY_DATASET: FactoryDataset = {
  name: '本地导入工厂',
  materials: [],
  bom: [],
  inventory: [],
  supplies: [],
  orders: [],
}

const DEFAULT_PARAMS: ScenarioParameters = {
  redesignDays: 12,
  redesignCost: 180_000,
  yieldGainPct: 1.5,
  allocationMode: 'priority',
}

const CSV_SAMPLES: Record<DataKind, string> = {
  bom: '父项,子项,单耗\nFG-001,ASM-01,1\nASM-01,CAP-104-50V,3',
  inventory: '料号,现有量,占用,库位\nCAP-104-50V,620 pcs,80,A01-03',
  supply:
    '到货计划号,物料编码,数量,到货日期,供应商,采购订单\nSUP-01,CAP-104-50V,"1,600件",2026年8月19日,示例供应商,PO-001',
  orders:
    '编号,成品,数量,完工日期,产线,客户,客户等级,日罚款\nWO-001,FG-001,40,2026/08/10,L1,示例客户,1,1800',
}

function ensureMaterials(dataset: FactoryDataset): FactoryDataset {
  const current = new Map(dataset.materials.map((material) => [material.id, material]))
  const parents = new Set(dataset.bom.map((edge) => edge.parentId))
  const children = new Set(dataset.bom.map((edge) => edge.componentId))
  dataset.orders.forEach((order) => {
    if (!current.has(order.productId)) {
      current.set(order.productId, {
        id: order.productId,
        name: order.productId,
        type: 'finished',
        unit: 'pcs',
      })
    }
  })
  for (const id of new Set([...parents, ...children])) {
    if (current.has(id)) continue
    const type: Material['type'] = dataset.orders.some((order) => order.productId === id)
      ? 'finished'
      : parents.has(id)
        ? 'assembly'
        : 'component'
    current.set(id, { id, name: id, type, unit: 'pcs' })
  }
  dataset.inventory.forEach((record) => {
    if (!current.has(record.materialId)) {
      current.set(record.materialId, {
        id: record.materialId,
        name: record.materialId,
        type: 'component',
        unit: 'pcs',
      })
    }
  })
  dataset.supplies.forEach((record) => {
    if (!current.has(record.materialId)) {
      current.set(record.materialId, {
        id: record.materialId,
        name: record.materialId,
        type: 'component',
        unit: 'pcs',
      })
    }
  })
  return { ...dataset, materials: [...current.values()] }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function App() {
  const [dataset, setDataset] = useState<FactoryDataset | null>(null)
  const [focusMaterial, setFocusMaterial] = useState(DEMO_FOCUS_MATERIAL)
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [dataOpen, setDataOpen] = useState(false)
  const [importKind, setImportKind] = useState<DataKind>('bom')
  const [csvText, setCsvText] = useState(CSV_SAMPLES.bom)
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([])
  const [lastImportCount, setLastImportCount] = useState<number | null>(null)
  const [copied, setCopied] = useState('')
  const deferredDataset = useDeferredValue(dataset)
  const deferredParams = useDeferredValue(params)
  const analysis =
    deferredDataset &&
    deferredDataset.materials.some((material) => material.id === focusMaterial) &&
    deferredDataset.orders.length
      ? analyzeShock(deferredDataset, focusMaterial, deferredParams)
      : null

  const loadDemo = () => {
    const demo = generateDemoFactory()
    startTransition(() => {
      setDataset(demo)
      setFocusMaterial(DEMO_FOCUS_MATERIAL)
      setParams(DEFAULT_PARAMS)
      setDataOpen(false)
      setImportWarnings([])
    })
  }

  const startImport = () => {
    setDataset(EMPTY_DATASET)
    setDataOpen(true)
  }

  const updateSupplyDate = (date: string) => {
    setDataset((current) =>
      current
        ? {
            ...current,
            supplies: current.supplies.map((supply) =>
              supply.id === DEMO_DELAYED_SUPPLY ||
              (supply.materialId === focusMaterial &&
                supply.dueDate ===
                  current.supplies
                    .filter((item) => item.materialId === focusMaterial)
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate)
                ? { ...supply, dueDate: date }
                : supply,
            ),
          }
        : current,
    )
  }

  const importCsv = () => {
    if (!dataset) return
    let next = { ...dataset }
    let warnings: ImportWarning[]
    let count: number
    if (importKind === 'bom') {
      const result = parseBomCsv(csvText)
      next = { ...next, bom: [...next.bom, ...result.rows] }
      warnings = result.warnings
      count = result.rows.length
    } else if (importKind === 'inventory') {
      const result = parseInventoryCsv(csvText)
      next = { ...next, inventory: [...next.inventory, ...result.rows] }
      warnings = result.warnings
      count = result.rows.length
    } else if (importKind === 'supply') {
      const result = parseSupplyCsv(csvText)
      next = { ...next, supplies: [...next.supplies, ...result.rows] }
      warnings = result.warnings
      count = result.rows.length
    } else {
      const result = parseOrdersCsv(csvText)
      next = { ...next, orders: [...next.orders, ...result.rows] }
      warnings = result.warnings
      count = result.rows.length
    }
    const normalized = ensureMaterials(next)
    setDataset(normalized)
    setImportWarnings(warnings)
    setLastImportCount(count)
    const candidate = normalized.materials.find((material) => material.type === 'component')
    if (!normalized.materials.some((material) => material.id === focusMaterial) && candidate) {
      setFocusMaterial(candidate.id)
    }
  }

  const onFile = async (file: File) => {
    const text = await file.text()
    setCsvText(text)
    setLastImportCount(null)
    setImportWarnings([])
  }

  const changeImportKind = (kind: DataKind) => {
    setImportKind(kind)
    setCsvText(CSV_SAMPLES[kind])
    setLastImportCount(null)
    setImportWarnings([])
  }

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1800)
  }

  const focusOptions =
    dataset?.materials.filter((material) =>
      dataset.orders.some((order) => explodeProduct(order.productId, dataset.bom).usage.has(material.id)),
    ) ?? []
  const supply = dataset?.supplies
    .filter((item) => item.materialId === focusMaterial)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  if (!dataset) {
    return (
      <div className="landing-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="断料雷达首页">
            <span className="brand__mark"><Zap /></span>
            <span>断料雷达<small>BOM SHOCKWAVE</small></span>
          </a>
          <span className="local-proof"><LockKeyhole /> 零上传 · 零密钥 · 浏览器本地计算</span>
        </header>
        <main id="top">
          <section className="hero">
            <div className="hero__copy">
              <span className="eyebrow">Factory shortage command center</span>
              <h1>断料雷达</h1>
              <p className="hero__headline">一颗电阻缺货，30 秒看清打击面。</p>
              <p className="hero__body">
                导入多层 BOM、库存、到货与周计划。系统不替你“发明策略”，只把催交、挪料、
                改承诺、替代料和提良率算成一个明显选择，再拆成可直接下发的部门指令。
              </p>
              <div className="hero__actions">
                <button className="button button--primary" type="button" onClick={loadDemo}>
                  <Play /> 一键引爆合成工厂
                </button>
                <button className="button button--ghost" type="button" onClick={startImport}>
                  <FileSpreadsheet /> 导入我的 CSV
                </button>
              </div>
              <div className="hero__proof">
                <ShieldCheck />
                <span>
                  <strong>不是 AI 猜数字</strong>
                  所有净算、传播与排序来自 TypeScript 确定性规则；指令只由模板生成。
                </span>
              </div>
            </div>
            <div className="hero__visual" aria-hidden="true">
              <div className="radar">
                <span className="radar__sweep" />
                <span className="radar__core">C</span>
                <i className="radar__dot radar__dot--a" />
                <i className="radar__dot radar__dot--b" />
                <i className="radar__dot radar__dot--c" />
                <i className="radar__dot radar__dot--d" />
                <b>CAP-104-50V</b>
                <small>DELAY +14 DAYS</small>
              </div>
              <div className="shock-label">
                <span>01</span>
                <strong>缺料事件</strong>
                <i />
                <span>24</span>
                <strong>成品传播</strong>
                <i />
                <span>04</span>
                <strong>部门执行</strong>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <button className="brand brand--button" type="button" onClick={() => setDataset(null)}>
          <span className="brand__mark"><Zap /></span>
          <span>断料雷达<small>BOM SHOCKWAVE</small></span>
        </button>
        <div className="workspace-topbar__actions">
          <span className="local-proof"><LockKeyhole /> 数据只在当前页面</span>
          <button className="icon-button" type="button" onClick={loadDemo} aria-label="重置演示">
            <RotateCcw />
          </button>
          <button className="button button--small" type="button" onClick={() => setDataOpen(true)}>
            <Database /> 数据台
          </button>
        </div>
      </header>

      <main className="workspace-main">
        <section className="event-head">
          <div>
            <span className="eyebrow">Active shortage event / 实时重算</span>
            <h1>{analysis?.materialName ?? focusMaterial}</h1>
            <p>
              <span>{focusMaterial}</span>
              {supply ? `${supply.purchaseOrder} · ${supply.supplier}` : '尚无到货计划'}
            </p>
          </div>
          <div className="event-controls">
            <label>
              推演物料
              <select value={focusMaterial} onChange={(event) => setFocusMaterial(event.target.value)}>
                {focusOptions.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.id} · {material.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              首批到货日
              <input
                type="date"
                value={supply?.dueDate ?? ''}
                disabled={!supply}
                onChange={(event) => updateSupplyDate(event.target.value)}
              />
            </label>
            <span className="recalc-mark"><Sparkles /> 修改后全图即时重算</span>
          </div>
        </section>

        {!analysis ? (
          <section className="empty-workspace">
            <TriangleAlert />
            <h2>还不能推演</h2>
            <p>至少导入 BOM 与产线工单，再选择一个被成品使用的物料。</p>
            <button className="button button--primary" type="button" onClick={() => setDataOpen(true)}>
              打开数据台
            </button>
          </section>
        ) : (
          <>
            <section className="signal-strip" aria-label="缺料事件摘要">
              <article>
                <span>净缺口</span>
                <strong>{Math.round(analysis.totalShortage).toLocaleString()}</strong>
                <small>pcs</small>
              </article>
              <article>
                <span>受击成品</span>
                <strong>{analysis.affectedProducts}</strong>
                <small>/ {dataset.orders.length} 张工单</small>
              </article>
              <article>
                <span>断线日</span>
                <strong>{formatShortDate(analysis.firstStopDate)}</strong>
                <small>{analysis.affectedLines} 条线</small>
              </article>
              <article className="signal-strip__danger">
                <span>延期代价</span>
                <strong>¥{Math.round(analysis.totalPenalty / 10_000).toLocaleString()}万</strong>
                <small>{analysis.affectedCustomers} 个客户</small>
              </article>
            </section>

            <section className="analysis-grid">
              <article className="surface surface--graph">
                <div className="section-head">
                  <div>
                    <span className="section-kicker"><Network /> 打击面</span>
                    <h2>从一颗料，穿透到客户承诺</h2>
                  </div>
                  <span className="live-mark"><i /> LIVE</span>
                </div>
                <ImpactGraph analysis={analysis} />
              </article>

              <article className="surface playbook">
                <div className="section-head">
                  <div>
                    <span className="section-kicker"><Gauge /> 决策 Playbook</span>
                    <h2>选项不新鲜，参数才值钱</h2>
                  </div>
                </div>
                <div className="playbook__inputs">
                  <label>
                    替代料验证
                    <span>
                      <input
                        type="number"
                        min="1"
                        value={params.redesignDays}
                        onChange={(event) =>
                          setParams((current) => ({
                            ...current,
                            redesignDays: Number(event.target.value),
                          }))
                        }
                      />
                      天
                    </span>
                  </label>
                  <label>
                    验证成本
                    <span>
                      ¥
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={params.redesignCost}
                        onChange={(event) =>
                          setParams((current) => ({
                            ...current,
                            redesignCost: Number(event.target.value),
                          }))
                        }
                      />
                    </span>
                  </label>
                  <label>
                    可提良率
                    <span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={params.yieldGainPct}
                        onChange={(event) =>
                          setParams((current) => ({
                            ...current,
                            yieldGainPct: Number(event.target.value),
                          }))
                        }
                      />
                      %
                    </span>
                  </label>
                </div>
                <div className="playbook__list">
                  {analysis.playbook.map((option, index) => (
                    <article className={`option option--${option.verdict}`} key={option.id}>
                      <div className="option__rank">0{index + 1}</div>
                      <div className="option__body">
                        <div>
                          <h3>{option.title}</h3>
                          <span>{option.owner}</span>
                        </div>
                        <strong>{option.metric}</strong>
                        <p>{option.detail}</p>
                        <small>
                          <Clock3 /> 选项窗口剩 {option.windowDays} 天
                        </small>
                      </div>
                      {option.verdict === 'recommended' && <span className="recommend">当前首选</span>}
                    </article>
                  ))}
                </div>
              </article>
            </section>

            <section className="surface schedule">
              <div className="section-head">
                <div>
                  <span className="section-kicker"><Layers3 /> 产线计划 Delta</span>
                  <h2>谁按时，谁待料，谁先换排</h2>
                </div>
                <label className="allocation-toggle">
                  分配规则
                  <select
                    value={params.allocationMode}
                    onChange={(event) =>
                      setParams((current) => ({
                        ...current,
                        allocationMode: event.target.value as ScenarioParameters['allocationMode'],
                      }))
                    }
                  >
                    <option value="priority">客户等级 + 罚款</option>
                    <option value="due-date">原交期优先</option>
                  </select>
                </label>
              </div>
              <div className="schedule__legend">
                <span><i className="legend-safe" /> 原计划</span>
                <span><i className="legend-delay" /> 缺料延期</span>
              </div>
              <div className="schedule__rows">
                {analysis.exposures.slice(0, 12).map((exposure) => (
                  <div className="schedule-row" key={exposure.order.id}>
                    <div>
                      <strong>{exposure.order.line}</strong>
                      <span>{exposure.order.id}</span>
                    </div>
                    <p>{exposure.productName}</p>
                    <div className="gantt">
                      <span
                        className="gantt__base"
                        style={{ width: `${Math.min(80, 30 + exposure.order.quantity / 2)}%` }}
                      />
                      {exposure.delayDays > 0 && (
                        <span
                          className="gantt__delay"
                          style={{
                            left: `${Math.min(80, 30 + exposure.order.quantity / 2)}%`,
                            width: `${Math.min(35, 7 + exposure.delayDays * 2)}%`,
                          }}
                        />
                      )}
                    </div>
                    <strong className={`schedule-status schedule-status--${exposure.status}`}>
                      {exposure.status === 'safe' ? '按时' : `+${exposure.delayDays} 天`}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="directives">
              <div className="directives__intro">
                <span className="section-kicker"><Users /> 执行编排</span>
                <h2>分析到此结束。<br />现在把指令发出去。</h2>
                <p>
                  每张卡同时提供人类可读工单和结构化 JSON。复制给部门 agent 或负责人，
                  参数、边界与回报格式都已经写明。
                </p>
                <button
                  className="button button--dark"
                  type="button"
                  onClick={() =>
                    downloadJson(`shockwave-${analysis.materialId}.json`, {
                      analysis,
                      dataset: {
                        name: dataset.name,
                        source: 'browser-local',
                      },
                    })
                  }
                >
                  <ArrowDownToLine /> 导出完整事件 JSON
                </button>
              </div>
              <div className="directive-grid">
                {analysis.directives.map((directive, index) => (
                  <article className="directive" key={directive.id}>
                    <span className="directive__number">0{index + 1}</span>
                    <div className="directive__dept">{directive.department}</div>
                    <h3>{directive.title}</h3>
                    <p>{directive.summary}</p>
                    <div className="directive__actions">
                      <button
                        type="button"
                        onClick={() => copyText(directive.id, directive.prompt)}
                      >
                        {copied === directive.id ? <Check /> : <Clipboard />}
                        {copied === directive.id ? '已复制' : '复制为 agent prompt'}
                      </button>
                      <button
                        type="button"
                        aria-label={`复制${directive.department} JSON`}
                        onClick={() =>
                          copyText(`${directive.id}-json`, JSON.stringify(directive.payload, null, 2))
                        }
                      >
                        {copied === `${directive.id}-json` ? <Check /> : <Braces />}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {dataOpen && (
        <div className="drawer-backdrop" role="presentation">
          <aside className="data-drawer" aria-label="数据导入台">
            <div className="data-drawer__head">
              <div>
                <span className="eyebrow">Local data workbench</span>
                <h2>把四张散表拼成一张打击面</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setDataOpen(false)}
                aria-label="关闭数据台"
              >
                <X />
              </button>
            </div>
            <div className="data-counts">
              <span><strong>{dataset.bom.length}</strong>BOM 行</span>
              <span><strong>{dataset.inventory.length}</strong>库存行</span>
              <span><strong>{dataset.supplies.length}</strong>到货行</span>
              <span><strong>{dataset.orders.length}</strong>工单</span>
            </div>
            <div className="data-tabs">
              {([
                ['bom', 'BOM'],
                ['inventory', '库存'],
                ['supply', '到货'],
                ['orders', '周计划'],
              ] as [DataKind, string][]).map(([kind, label]) => (
                <button
                  className={importKind === kind ? 'active' : ''}
                  key={kind}
                  type="button"
                  onClick={() => changeImportKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="file-drop">
              <Upload />
              <span>
                <strong>选择 CSV 文件</strong>
                文件只读入当前浏览器内存
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
              />
            </label>
            <label className="paste-field">
              或直接粘贴 CSV
              <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} />
            </label>
            {lastImportCount !== null && (
              <div className="import-result" role="status">
                <Check /> 已加入 {lastImportCount} 行
                {importWarnings.length > 0 && `；跳过 ${importWarnings.length} 行`}
              </div>
            )}
            {importWarnings.length > 0 && (
              <details className="warning-list">
                <summary><ChevronDown /> 查看解析警告</summary>
                {importWarnings.map((warning, index) => (
                  <p key={`${warning.row}-${index}`}>
                    {warning.row ? `第 ${warning.row} 行：` : ''}{warning.message}
                  </p>
                ))}
              </details>
            )}
            <button className="button button--primary button--wide" type="button" onClick={importCsv}>
              识别列名并加入数据 <ArrowRight />
            </button>
            <p className="drawer-note">
              支持“物料编码 / 料号 / material”、中文日期、斜杠日期、Excel 日期序号，以及
              “1,200 pcs / 3.5K / 620件”等数量格式。坏行会被跳过并明确列出。
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
