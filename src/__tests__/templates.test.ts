import { describe, expect, it } from 'vitest'
import { generateDemoFactory, DEMO_FOCUS_MATERIAL } from '../lib/demoFactory'
import { analyzeShock } from '../lib/engine'

describe('department instruction templates', () => {
  const analysis = analyzeShock(generateDemoFactory(), DEMO_FOCUS_MATERIAL, {
    redesignDays: 12,
    redesignCost: 180_000,
    yieldGainPct: 1.5,
    allocationMode: 'priority',
  })

  it('emits both human prompts and structured payloads', () => {
    analysis.directives.forEach((directive) => {
      expect(directive.prompt.length).toBeGreaterThan(80)
      expect(directive.payload).toHaveProperty('action')
      expect(JSON.stringify(directive.payload)).toContain(DEMO_FOCUS_MATERIAL)
    })
  })

  it('includes computed dates and quantities instead of placeholders', () => {
    const procurement = analysis.directives[0]
    expect(procurement.prompt).toContain(analysis.firstStopDate)
    expect(procurement.prompt).toContain(Math.round(analysis.totalShortage).toLocaleString())
    expect(procurement.prompt).not.toContain('{{')
  })

  it('compiles redesign inputs into a gated engineering instruction', () => {
    const engineering = analysis.directives.find((directive) => directive.id === 'engineering')
    expect(engineering?.payload).toMatchObject({
      action: 'qualify_substitute_material',
      material_id: DEMO_FOCUS_MATERIAL,
      qualification_days: 12,
      budget_cap: 180_000,
      unapproved_substitution_forbidden: true,
    })
    expect(engineering?.prompt).toContain('不得改 BOM')
    expect(engineering?.prompt).toContain('研发与质量共同签字')
  })

  it('gives sales traceable customer orders and forbids unsupported promises', () => {
    const sales = analysis.directives.find((directive) => directive.id === 'sales')
    expect(sales?.payload).toMatchObject({
      action: 'renegotiate_customer_commitments',
      material_event: DEMO_FOCUS_MATERIAL,
      promises_require_planning_confirmation: true,
    })
    expect(sales?.prompt).toContain('不得为了安抚客户擅自承诺更早日期')
    expect(JSON.stringify(sales?.payload)).toContain('projected_finish_date')
  })

  it('extends logistics through inspection release instead of stopping at shipment', () => {
    const logistics = analysis.directives.find((directive) => directive.id === 'logistics')
    expect(logistics?.payload).toMatchObject({
      action: 'expedite_inbound_logistics',
      material_id: DEMO_FOCUS_MATERIAL,
    })
    expect(JSON.stringify(logistics?.payload)).toContain('inspection_release')
    expect(logistics?.prompt).toContain('不要把“已发货”当作“已可用”')
  })
})
