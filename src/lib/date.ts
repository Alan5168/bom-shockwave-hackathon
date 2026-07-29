const DAY_MS = 86_400_000

export function toIsoDate(value: string | number | Date): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' || /^\d{5}(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value)
    if (serial > 20_000 && serial < 80_000) {
      const excelEpoch = Date.UTC(1899, 11, 30)
      return new Date(excelEpoch + serial * DAY_MS).toISOString().slice(0, 10)
    }
  }

  const normalized = String(value)
    .trim()
    .replace(/[年月/.]/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, '')
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((end - start) / DAY_MS)
}

export function formatShortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

