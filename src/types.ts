export type DataKind = 'bom' | 'inventory' | 'supply' | 'orders'

export interface Material {
  id: string
  name: string
  type: 'finished' | 'assembly' | 'component'
  unit: string
}

export interface BomEdge {
  parentId: string
  componentId: string
  quantity: number
  scrapRate?: number
}

export interface InventoryRecord {
  materialId: string
  onHand: number
  reserved: number
  location: string
}

export interface SupplyRecord {
  id: string
  materialId: string
  quantity: number
  dueDate: string
  supplier: string
  purchaseOrder: string
}

export interface ProductionOrder {
  id: string
  productId: string
  quantity: number
  dueDate: string
  line: string
  customer: string
  customerTier: 1 | 2 | 3
  latePenaltyPerDay: number
}

export interface FactoryDataset {
  name: string
  materials: Material[]
  bom: BomEdge[]
  inventory: InventoryRecord[]
  supplies: SupplyRecord[]
  orders: ProductionOrder[]
}

export interface ImportWarning {
  row?: number
  message: string
}

export interface ImportResult<T> {
  rows: T[]
  warnings: ImportWarning[]
  mappedHeaders: Record<string, string>
}

export interface OrderExposure {
  order: ProductionOrder
  productName: string
  unitUsage: number
  required: number
  allocated: number
  shortage: number
  baselineFinishDate: string
  projectedFinishDate: string
  delayDays: number
  penalty: number
  status: 'safe' | 'at-risk' | 'stopped'
}

export interface MaterialRequirement {
  materialId: string
  gross: number
  onHand: number
  inbound: number
  shortage: number
}

export interface PlaybookOption {
  id: 'expedite' | 'reallocate' | 'customer' | 'redesign' | 'internal'
  title: string
  owner: string
  verdict: 'recommended' | 'viable' | 'weak'
  score: number
  windowDays: number
  metric: string
  detail: string
  cost: number
  savedOrders: number
}

export interface DepartmentDirective {
  id:
    | 'procurement'
    | 'production'
    | 'warehouse'
    | 'planning'
    | 'engineering'
    | 'sales'
    | 'logistics'
  department: string
  title: string
  summary: string
  prompt: string
  payload: Record<string, unknown>
}

export interface ShockAnalysis {
  materialId: string
  materialName: string
  generatedAt: string
  exposures: OrderExposure[]
  requirements: MaterialRequirement[]
  affectedProducts: number
  affectedLines: number
  affectedCustomers: number
  totalShortage: number
  totalPenalty: number
  firstStopDate: string
  nextSupplyDate: string | null
  playbook: PlaybookOption[]
  directives: DepartmentDirective[]
}

export interface ScenarioParameters {
  redesignDays: number
  redesignCost: number
  yieldGainPct: number
  allocationMode: 'priority' | 'due-date'
}
