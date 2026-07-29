import { describe, expect, it } from 'vitest'
import {
  parseBomCsv,
  parseInventoryCsv,
  parseLooseNumber,
  parseOrdersCsv,
  parseSupplyCsv,
} from '../lib/csv'
import { toIsoDate } from '../lib/date'

describe('dirty numeric and date parsing', () => {
  it.each([
    ['1,200 pcs', 1200],
    ['620件', 620],
    ['3.5K', 3500],
    ['12 公斤', 12],
  ])('parses %s as %s', (input, expected) => {
    expect(parseLooseNumber(input)).toBe(expected)
  })

  it.each([
    ['2026年8月19日', '2026-08-19'],
    ['2026/8/9', '2026-08-09'],
    ['46242', '2026-08-08'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })

  it('rejects an impossible calendar date', () => {
    expect(toIsoDate('2026-02-30')).toBeNull()
  })
})

describe('fuzzy CSV headers', () => {
  it('maps Chinese BOM aliases and skips a bad row', () => {
    const result = parseBomCsv(
      '上层物料,下层物料,单耗,损耗率\nFG-1,ASM-1,1,0\nASM-1,CAP-1,3 pcs,2\nBAD,,oops,0',
    )
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({
      parentId: 'ASM-1',
      componentId: 'CAP-1',
      quantity: 3,
      scrapRate: 0.02,
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('maps inventory aliases and defaults optional fields', () => {
    const result = parseInventoryCsv('物料编码,可用库存\nCAP-1,"1,200件"')
    expect(result.rows[0]).toEqual({
      materialId: 'CAP-1',
      onHand: 1200,
      reserved: 0,
      location: '未指定',
    })
  })

  it('maps supply aliases and tolerates Chinese dates', () => {
    const result = parseSupplyCsv(
      '料号,需求数量,交期,供应商,采购单\nCAP-1,500,2026年8月19日,合成供应商,PO-9',
    )
    expect(result.rows[0]).toMatchObject({
      materialId: 'CAP-1',
      quantity: 500,
      dueDate: '2026-08-19',
      purchaseOrder: 'PO-9',
    })
  })

  it('bounds customer tiers and defaults missing penalties', () => {
    const result = parseOrdersCsv(
      '工单编号,产品编码,数量,需求日期,线体,客户名称,优先级\nWO-1,FG-1,20,2026/8/11,L2,合成客户,9',
    )
    expect(result.rows[0]).toMatchObject({
      productId: 'FG-1',
      customerTier: 3,
      latePenaltyPerDay: 0,
    })
  })
})
