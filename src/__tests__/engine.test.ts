import { describe, expect, it } from 'vitest'
import { generateDemoFactory, DEMO_FOCUS_MATERIAL } from '../lib/demoFactory'
import { analyzeShock, explodeProduct } from '../lib/engine'
import type { BomEdge, ScenarioParameters } from '../types'

const params: ScenarioParameters = {
  redesignDays: 12,
  redesignCost: 180_000,
  yieldGainPct: 1.5,
  allocationMode: 'priority',
}

describe('multi-level BOM explosion', () => {
  it('accumulates a shared component reached by two branches', () => {
    const bom: BomEdge[] = [
      { parentId: 'FG', componentId: 'ASM-A', quantity: 2 },
      { parentId: 'FG', componentId: 'ASM-B', quantity: 1 },
      { parentId: 'ASM-A', componentId: 'CAP', quantity: 3 },
      { parentId: 'ASM-B', componentId: 'CAP', quantity: 4 },
    ]
    const result = explodeProduct('FG', bom)
    expect(result.usage.get('CAP')).toBe(10)
    expect(result.cycles).toEqual([])
  })

  it('applies scrap rate without mutating source BOM', () => {
    const bom: BomEdge[] = [
      { parentId: 'FG', componentId: 'ASM', quantity: 2 },
      { parentId: 'ASM', componentId: 'CAP', quantity: 5, scrapRate: 0.1 },
    ]
    expect(explodeProduct('FG', bom).usage.get('CAP')).toBeCloseTo(11)
    expect(bom[1].quantity).toBe(5)
  })

  it('cuts a cyclic reference and reports the exact cycle path', () => {
    const bom: BomEdge[] = [
      { parentId: 'FG', componentId: 'ASM', quantity: 1 },
      { parentId: 'ASM', componentId: 'SUB', quantity: 1 },
      { parentId: 'SUB', componentId: 'ASM', quantity: 1 },
    ]
    const result = explodeProduct('FG', bom)
    expect(result.cycles).toEqual([['FG', 'ASM', 'SUB', 'ASM']])
    expect(result.usage.get('SUB')).toBe(1)
  })
})

describe('shock propagation', () => {
  it('propagates the shared capacitor shortage to products, lines and customers', () => {
    const analysis = analyzeShock(generateDemoFactory(), DEMO_FOCUS_MATERIAL, params)
    expect(analysis.totalShortage).toBeGreaterThan(0)
    expect(analysis.affectedProducts).toBeGreaterThan(3)
    expect(analysis.affectedLines).toBeGreaterThan(1)
    expect(analysis.affectedCustomers).toBeGreaterThan(1)
    expect(analysis.directives.map((directive) => directive.id)).toEqual([
      'procurement',
      'production',
      'warehouse',
      'planning',
      'engineering',
      'sales',
      'logistics',
    ])
  })

  it('recalculates deterministically when the first supply date changes', () => {
    const baseline = generateDemoFactory()
    const delayed = analyzeShock(baseline, DEMO_FOCUS_MATERIAL, params)
    const recoveredDataset = {
      ...baseline,
      supplies: baseline.supplies.map((supply) =>
        supply.materialId === DEMO_FOCUS_MATERIAL && supply.dueDate === '2026-08-19'
          ? { ...supply, dueDate: '2026-08-05' }
          : supply,
      ),
    }
    const recovered = analyzeShock(recoveredDataset, DEMO_FOCUS_MATERIAL, params)
    expect(recovered.totalShortage).toBeLessThan(delayed.totalShortage)
    expect(recovered.totalPenalty).toBeLessThan(delayed.totalPenalty)
  })

  it('uses explicit human parameters in the redesign option', () => {
    const analysis = analyzeShock(generateDemoFactory(), DEMO_FOCUS_MATERIAL, {
      ...params,
      redesignDays: 7,
      redesignCost: 90_000,
    })
    const redesign = analysis.playbook.find((option) => option.id === 'redesign')
    expect(redesign?.metric).toContain('7 天')
    expect(redesign?.metric).toContain('90,000')
  })
})
