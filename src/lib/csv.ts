import { toIsoDate } from './date'
import type {
  BomEdge,
  ImportResult,
  InventoryRecord,
  ProductionOrder,
  SupplyRecord,
} from '../types'

type RawRow = Record<string, string>

const ALIASES = {
  parentId: ['父项', '父件', 'parent', 'parentitem', '母件', '上层物料'],
  componentId: ['子项', '子件', 'component', 'componentitem', '物料编码', '组件', '下层物料'],
  quantity: ['数量', '用量', 'qty', 'quantity', '单耗', '需求数量'],
  scrapRate: ['损耗率', 'scrap', 'scraprate'],
  materialId: ['物料', '物料编码', '料号', 'material', 'materialid', 'item'],
  onHand: ['现有量', '库存', 'onhand', 'available', '可用库存'],
  reserved: ['预留', '占用', 'reserved', 'allocated'],
  location: ['库位', '仓库', 'location', 'warehouse'],
  id: ['编号', 'id', '记录号', '到货计划号'],
  dueDate: ['日期', '到货日期', '交期', 'duedate', 'date', '需求日期', '完工日期'],
  supplier: ['供应商', 'supplier', 'vendor'],
  purchaseOrder: ['采购单', '采购订单', 'po', 'purchaseorder'],
  productId: ['成品', '产品', '产品编码', 'product', 'productid'],
  line: ['产线', '线体', 'line', 'productionline'],
  customer: ['客户', 'customer', '客户名称'],
  customerTier: ['客户等级', '优先级', 'tier', 'customertier'],
  latePenaltyPerDay: ['日罚款', '违约金', 'penalty', 'latepenaltyperday'],
} as const

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_\-()[\]（）/\\]/g, '')
}

function scoreHeader(header: string, alias: string): number {
  const normalized = normalizeHeader(header)
  const target = normalizeHeader(alias)
  if (normalized === target) return 100
  if (normalized.includes(target) || target.includes(normalized)) return 70
  const shared = [...new Set(normalized)].filter((char) => target.includes(char)).length
  return shared / Math.max(normalized.length, target.length)
}

function mapHeaders(headers: string[], fields: readonly string[]): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const field of fields) {
    const aliases = ALIASES[field as keyof typeof ALIASES] ?? []
    const ranked = headers
      .map((header) => ({
        header,
        score: Math.max(...aliases.map((alias) => scoreHeader(header, alias))),
      }))
      .sort((a, b) => b.score - a.score)
    if (ranked[0] && ranked[0].score >= 0.6) mapped[field] = ranked[0].header
  }
  return mapped
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseCsv(text: string): RawRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

export function parseLooseNumber(value: string | number): number | null {
  const normalized = String(value)
    .trim()
    .replace(/[,，\s]/g, '')
    .replace(/(pcs?|件|个|套|kg|公斤|台|%)+$/i, '')
  if (!normalized) return null
  const multiplier = /k$/i.test(normalized) ? 1000 : 1
  const number = Number(normalized.replace(/k$/i, ''))
  return Number.isFinite(number) ? number * multiplier : null
}

function get(row: RawRow, mapped: Record<string, string>, field: string): string {
  return mapped[field] ? row[mapped[field]]?.trim() ?? '' : ''
}

export function parseBomCsv(text: string): ImportResult<BomEdge> {
  const raw = parseCsv(text)
  const headers = Object.keys(raw[0] ?? {})
  const mapped = mapHeaders(headers, ['parentId', 'componentId', 'quantity', 'scrapRate'])
  const warnings: ImportResult<BomEdge>['warnings'] = []
  const rows = raw.flatMap((row, index) => {
    const parentId = get(row, mapped, 'parentId')
    const componentId = get(row, mapped, 'componentId')
    const quantity = parseLooseNumber(get(row, mapped, 'quantity'))
    if (!parentId || !componentId || quantity === null || quantity <= 0) {
      warnings.push({ row: index + 2, message: '父项、子项或正数用量无法识别，已跳过。' })
      return []
    }
    const scrapRaw = parseLooseNumber(get(row, mapped, 'scrapRate'))
    return [{ parentId, componentId, quantity, scrapRate: scrapRaw ? scrapRaw / 100 : 0 }]
  })
  return { rows, warnings, mappedHeaders: mapped }
}

export function parseInventoryCsv(text: string): ImportResult<InventoryRecord> {
  const raw = parseCsv(text)
  const mapped = mapHeaders(Object.keys(raw[0] ?? {}), [
    'materialId',
    'onHand',
    'reserved',
    'location',
  ])
  const warnings: ImportResult<InventoryRecord>['warnings'] = []
  const rows = raw.flatMap((row, index) => {
    const materialId = get(row, mapped, 'materialId')
    const onHand = parseLooseNumber(get(row, mapped, 'onHand'))
    if (!materialId || onHand === null) {
      warnings.push({ row: index + 2, message: '料号或库存数量无法识别，已跳过。' })
      return []
    }
    return [{
      materialId,
      onHand,
      reserved: parseLooseNumber(get(row, mapped, 'reserved')) ?? 0,
      location: get(row, mapped, 'location') || '未指定',
    }]
  })
  return { rows, warnings, mappedHeaders: mapped }
}

export function parseSupplyCsv(text: string): ImportResult<SupplyRecord> {
  const raw = parseCsv(text)
  const mapped = mapHeaders(Object.keys(raw[0] ?? {}), [
    'id',
    'materialId',
    'quantity',
    'dueDate',
    'supplier',
    'purchaseOrder',
  ])
  const warnings: ImportResult<SupplyRecord>['warnings'] = []
  const rows = raw.flatMap((row, index) => {
    const materialId = get(row, mapped, 'materialId')
    const quantity = parseLooseNumber(get(row, mapped, 'quantity'))
    const dueDate = toIsoDate(get(row, mapped, 'dueDate'))
    if (!materialId || quantity === null || !dueDate) {
      warnings.push({ row: index + 2, message: '料号、数量或日期无法识别，已跳过。' })
      return []
    }
    return [{
      id: get(row, mapped, 'id') || `SUP-IMPORT-${index + 1}`,
      materialId,
      quantity,
      dueDate,
      supplier: get(row, mapped, 'supplier') || '未指定供应商',
      purchaseOrder: get(row, mapped, 'purchaseOrder') || '未指定采购单',
    }]
  })
  return { rows, warnings, mappedHeaders: mapped }
}

export function parseOrdersCsv(text: string): ImportResult<ProductionOrder> {
  const raw = parseCsv(text)
  const mapped = mapHeaders(Object.keys(raw[0] ?? {}), [
    'id',
    'productId',
    'quantity',
    'dueDate',
    'line',
    'customer',
    'customerTier',
    'latePenaltyPerDay',
  ])
  const warnings: ImportResult<ProductionOrder>['warnings'] = []
  const rows = raw.flatMap((row, index) => {
    const productId = get(row, mapped, 'productId')
    const quantity = parseLooseNumber(get(row, mapped, 'quantity'))
    const dueDate = toIsoDate(get(row, mapped, 'dueDate'))
    if (!productId || quantity === null || !dueDate) {
      warnings.push({ row: index + 2, message: '成品号、数量或日期无法识别，已跳过。' })
      return []
    }
    const rawTier = Math.round(parseLooseNumber(get(row, mapped, 'customerTier')) ?? 2)
    return [{
      id: get(row, mapped, 'id') || `WO-IMPORT-${index + 1}`,
      productId,
      quantity,
      dueDate,
      line: get(row, mapped, 'line') || '未分线',
      customer: get(row, mapped, 'customer') || '未指定客户',
      customerTier: Math.min(3, Math.max(1, rawTier)) as 1 | 2 | 3,
      latePenaltyPerDay: parseLooseNumber(get(row, mapped, 'latePenaltyPerDay')) ?? 0,
    }]
  })
  return { rows, warnings, mappedHeaders: mapped }
}

