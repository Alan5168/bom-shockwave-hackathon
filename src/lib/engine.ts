import { addDays, daysBetween } from './date'
import { buildDirectives } from './templates'
import type {
  BomEdge,
  FactoryDataset,
  MaterialRequirement,
  OrderExposure,
  PlaybookOption,
  ScenarioParameters,
  ShockAnalysis,
} from '../types'

export interface ExplosionResult {
  usage: Map<string, number>
  cycles: string[][]
}

export function explodeProduct(productId: string, bom: BomEdge[]): ExplosionResult {
  const byParent = new Map<string, BomEdge[]>()
  bom.forEach((edge) => {
    byParent.set(edge.parentId, [...(byParent.get(edge.parentId) ?? []), edge])
  })
  const usage = new Map<string, number>()
  const cycles: string[][] = []

  const walk = (materialId: string, factor: number, path: string[]) => {
    const children = byParent.get(materialId) ?? []
    for (const edge of children) {
      const nextFactor = factor * edge.quantity * (1 + (edge.scrapRate ?? 0))
      if (path.includes(edge.componentId)) {
        cycles.push([...path, edge.componentId])
        continue
      }
      usage.set(edge.componentId, (usage.get(edge.componentId) ?? 0) + nextFactor)
      walk(edge.componentId, nextFactor, [...path, edge.componentId])
    }
  }

  walk(productId, 1, [productId])
  return { usage, cycles }
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function calculatePlaybook(
  exposures: OrderExposure[],
  totalShortage: number,
  firstStopDate: string,
  nextSupplyDate: string | null,
  params: ScenarioParameters,
): PlaybookOption[] {
  const impacted = exposures.filter((exposure) => exposure.shortage > 0)
  const totalGross = exposures.reduce((sum, exposure) => sum + exposure.required, 0)
  const requiredYield = totalGross ? (totalShortage / totalGross) * 100 : 0
  const pullInDays = nextSupplyDate ? Math.max(0, daysBetween(firstStopDate, nextSupplyDate)) : 30
  const penalty = impacted.reduce((sum, exposure) => sum + exposure.penalty, 0)
  const windowDays = Math.max(0, daysBetween(getToday(), firstStopDate))
  const protectable = Math.max(1, Math.floor(impacted.length * 0.35))
  const raw: Omit<PlaybookOption, 'verdict'>[] = [
    {
      id: 'expedite',
      title: '催交期',
      owner: '采购',
      score: Math.max(20, 96 - pullInDays * 3),
      windowDays,
      metric: `需拉进 ${pullInDays} 天`,
      detail: `把首批到货拉到 ${firstStopDate}，可避免最早断线；允许分批先到 ${Math.ceil(totalShortage * 0.55).toLocaleString()} pcs。`,
      cost: pullInDays * 1800,
      savedOrders: impacted.length,
    },
    {
      id: 'reallocate',
      title: '挪料保单',
      owner: '计划',
      score: 88,
      windowDays: Math.max(0, windowDays - 1),
      metric: `先保 ${protectable} 张高代价订单`,
      detail: '按客户等级、日违约金和交期锁料，代价从“所有人一起晚”变成明确的取舍。',
      cost: Math.round(penalty * 0.28),
      savedOrders: protectable,
    },
    {
      id: 'customer',
      title: '提前改承诺',
      owner: '客户/销售',
      score: Math.max(15, 76 - Math.round(penalty / 100_000)),
      windowDays: Math.max(0, windowDays - 3),
      metric: `预计延期成本 ¥${Math.round(penalty).toLocaleString()}`,
      detail: `对 ${impacted.length} 张受影响工单分层沟通，先处理可滑单与低罚款订单。`,
      cost: Math.round(penalty),
      savedOrders: 0,
    },
    {
      id: 'redesign',
      title: '替代料 / 改方案',
      owner: '研发+质量',
      score: Math.max(10, 72 - params.redesignDays * 2 - Math.round(params.redesignCost / 50_000)),
      windowDays: Math.max(0, windowDays - params.redesignDays),
      metric: `${params.redesignDays} 天验证 · ¥${params.redesignCost.toLocaleString()}`,
      detail: '成本和验证周期是显式人工输入；工具不假装知道替代料认证代价。',
      cost: params.redesignCost,
      savedOrders: params.redesignDays <= windowDays ? impacted.length : 0,
    },
    {
      id: 'internal',
      title: '提良率 / 降损耗',
      owner: '生产',
      score: params.yieldGainPct >= requiredYield ? 82 : 24,
      windowDays,
      metric: `需提升 ${requiredYield.toFixed(1)}% · 当前可做 ${params.yieldGainPct.toFixed(1)}%`,
      detail:
        params.yieldGainPct >= requiredYield
          ? '现有改善空间理论上可覆盖缺口，仍需现场验证。'
          : '边际空间不足，不能单独救场，只能作为组合动作。',
      cost: Math.round(totalShortage * 2.5),
      savedOrders: params.yieldGainPct >= requiredYield ? impacted.length : 0,
    },
  ]

  return raw
    .sort((a, b) => b.score - a.score)
    .map((option, index) => ({
      ...option,
      verdict: index === 0 ? 'recommended' : option.score >= 65 ? 'viable' : 'weak',
    }))
}

export function analyzeShock(
  dataset: FactoryDataset,
  materialId: string,
  params: ScenarioParameters,
): ShockAnalysis {
  const material = dataset.materials.find((item) => item.id === materialId)
  if (!material) throw new Error(`找不到物料 ${materialId}`)

  const inventory = dataset.inventory
    .filter((record) => record.materialId === materialId)
    .reduce((sum, record) => sum + Math.max(0, record.onHand - record.reserved), 0)
  const supplies = dataset.supplies
    .filter((record) => record.materialId === materialId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const nextSupplyDate = supplies[0]?.dueDate ?? null
  const relevant = dataset.orders
    .map((order) => {
      const unitUsage = explodeProduct(order.productId, dataset.bom).usage.get(materialId) ?? 0
      return { order, unitUsage, required: unitUsage * order.quantity }
    })
    .filter((item) => item.required > 0)
    .sort((a, b) => {
      if (params.allocationMode === 'due-date') return a.order.dueDate.localeCompare(b.order.dueDate)
      return (
        a.order.customerTier - b.order.customerTier ||
        b.order.latePenaltyPerDay - a.order.latePenaltyPerDay ||
        a.order.dueDate.localeCompare(b.order.dueDate)
      )
    })

  const lots = [
    { date: '1900-01-01', remaining: inventory },
    ...supplies.map((supply) => ({ date: supply.dueDate, remaining: supply.quantity })),
  ]
  const exposures: OrderExposure[] = relevant.map(({ order, unitUsage, required }) => {
    let remaining = required
    let allocated = 0
    let projectedFinishDate = order.dueDate
    for (const lot of lots) {
      if (remaining <= 0) break
      const taken = Math.min(remaining, lot.remaining)
      if (taken <= 0) continue
      lot.remaining -= taken
      remaining -= taken
      if (lot.date <= order.dueDate) {
        allocated += taken
      } else {
        projectedFinishDate =
          projectedFinishDate > lot.date ? projectedFinishDate : lot.date
      }
    }
    const shortage = Math.max(0, required - allocated)
    if (remaining > 0) {
      const horizon = supplies.at(-1)?.dueDate ?? order.dueDate
      projectedFinishDate = addDays(
        horizon > order.dueDate ? horizon : order.dueDate,
        30,
      )
    }
    const delayDays = Math.max(0, daysBetween(order.dueDate, projectedFinishDate))
    const productName =
      dataset.materials.find((item) => item.id === order.productId)?.name ?? order.productId
    return {
      order,
      productName,
      unitUsage,
      required,
      allocated,
      shortage,
      baselineFinishDate: order.dueDate,
      projectedFinishDate,
      delayDays,
      penalty:
        delayDays *
        order.latePenaltyPerDay *
        (required > 0 ? Math.min(1, shortage / required) : 0),
      status: shortage === 0 ? 'safe' : delayDays > 7 ? 'stopped' : 'at-risk',
    }
  })

  const chronological = [...exposures].sort((a, b) =>
    a.order.dueDate.localeCompare(b.order.dueDate),
  )
  const impacted = chronological.filter((exposure) => exposure.shortage > 0)
  const firstStopDate = impacted[0]?.order.dueDate ?? chronological.at(-1)?.order.dueDate ?? getToday()
  const totalShortage = exposures.reduce((sum, exposure) => sum + exposure.shortage, 0)
  const totalGross = exposures.reduce((sum, exposure) => sum + exposure.required, 0)
  const inbound = supplies.reduce((sum, supply) => sum + supply.quantity, 0)
  const requirements: MaterialRequirement[] = [{
    materialId,
    gross: totalGross,
    onHand: inventory,
    inbound,
    shortage: totalShortage,
  }]
  const playbook = calculatePlaybook(
    exposures,
    totalShortage,
    firstStopDate,
    nextSupplyDate,
    params,
  )
  const supply = supplies[0]
  const directives = buildDirectives({
    materialId,
    materialName: material.name,
    totalShortage,
    firstStopDate,
    nextSupplyDate,
    exposures,
    supply,
  })

  return {
    materialId,
    materialName: material.name,
    generatedAt: new Date().toISOString(),
    exposures,
    requirements,
    affectedProducts: new Set(impacted.map((exposure) => exposure.order.productId)).size,
    affectedLines: new Set(impacted.map((exposure) => exposure.order.line)).size,
    affectedCustomers: new Set(impacted.map((exposure) => exposure.order.customer)).size,
    totalShortage,
    totalPenalty: impacted.reduce((sum, exposure) => sum + exposure.penalty, 0),
    firstStopDate,
    nextSupplyDate,
    playbook,
    directives,
  }
}
