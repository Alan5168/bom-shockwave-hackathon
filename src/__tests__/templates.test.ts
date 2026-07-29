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
})
