import type {
  BomEdge,
  FactoryDataset,
  InventoryRecord,
  Material,
  ProductionOrder,
  SupplyRecord,
} from '../types'

const PRODUCT_NAMES = [
  '边缘网关',
  '工业相机',
  '温控模组',
  '振动探头',
  '视觉控制器',
  '伺服驱动器',
  '数据采集器',
  '通信终端',
  '电机控制盒',
  '智能仪表',
  '安全继电器',
  '机器视觉灯',
  '微型变频器',
  '扫码终端',
  '定位基站',
  '电源监控器',
  '预测维护盒',
  '产线网关',
  '扭矩采集器',
  '能源计量器',
  '协议转换器',
  '设备诊断器',
  '无线采集器',
  '环境传感器',
]

const CUSTOMERS = ['华东智造', '南方精工', '远航汽车', '新川电子', '海岳机器人', '长星能源']

export const DEMO_FOCUS_MATERIAL = 'CAP-104-50V'
export const DEMO_DELAYED_SUPPLY = 'SUP-CAP-0805'

export function generateDemoFactory(): FactoryDataset {
  const materials: Material[] = [
    { id: DEMO_FOCUS_MATERIAL, name: '多层陶瓷电容 0.1μF / 50V', type: 'component', unit: 'pcs' },
    { id: 'RES-10K-0603', name: '贴片电阻 10kΩ', type: 'component', unit: 'pcs' },
    { id: 'IC-MCU-A7', name: '工业级 MCU A7', type: 'component', unit: 'pcs' },
    { id: 'IC-PWR-24', name: '24V 电源管理芯片', type: 'component', unit: 'pcs' },
    { id: 'PCB-4L-A', name: '四层控制板 A', type: 'component', unit: 'pcs' },
    { id: 'PCB-4L-B', name: '四层控制板 B', type: 'component', unit: 'pcs' },
    { id: 'CON-M12', name: 'M12 工业连接器', type: 'component', unit: 'pcs' },
    { id: 'CASE-AL', name: '压铸铝外壳', type: 'component', unit: 'pcs' },
    { id: 'DISPLAY-24', name: '2.4 寸显示屏', type: 'component', unit: 'pcs' },
    { id: 'SENSOR-T', name: '温度传感芯片', type: 'component', unit: 'pcs' },
    { id: 'LABEL-QR', name: '追溯标签', type: 'component', unit: 'pcs' },
    { id: 'PACK-STD', name: '标准包装组', type: 'component', unit: 'set' },
  ]

  const bom: BomEdge[] = []

  for (let index = 0; index < 8; index += 1) {
    const assemblyId = `ASM-${String(index + 1).padStart(2, '0')}`
    materials.push({
      id: assemblyId,
      name: `控制核心模组 ${String.fromCharCode(65 + index)}`,
      type: 'assembly',
      unit: 'pcs',
    })
    bom.push(
      { parentId: assemblyId, componentId: DEMO_FOCUS_MATERIAL, quantity: 2 + (index % 3) },
      { parentId: assemblyId, componentId: 'RES-10K-0603', quantity: 5 + index },
      { parentId: assemblyId, componentId: 'IC-MCU-A7', quantity: 1 },
      { parentId: assemblyId, componentId: index % 2 ? 'PCB-4L-B' : 'PCB-4L-A', quantity: 1 },
    )
  }

  PRODUCT_NAMES.forEach((name, index) => {
    const productId = `FG-${String(index + 1).padStart(3, '0')}`
    const assemblyId = `ASM-${String((index % 8) + 1).padStart(2, '0')}`
    materials.push({ id: productId, name, type: 'finished', unit: 'pcs' })
    bom.push(
      { parentId: productId, componentId: assemblyId, quantity: 1 },
      { parentId: productId, componentId: 'IC-PWR-24', quantity: 1 },
      { parentId: productId, componentId: 'CON-M12', quantity: 1 + (index % 2) },
      { parentId: productId, componentId: 'CASE-AL', quantity: 1 },
      { parentId: productId, componentId: 'LABEL-QR', quantity: 1 },
      { parentId: productId, componentId: 'PACK-STD', quantity: 1 },
      ...(index % 4 === 0
        ? [{ parentId: productId, componentId: 'DISPLAY-24', quantity: 1 }]
        : []),
    )
  })

  const inventory: InventoryRecord[] = [
    { materialId: DEMO_FOCUS_MATERIAL, onHand: 620, reserved: 80, location: 'A01-03' },
    { materialId: 'RES-10K-0603', onHand: 18_000, reserved: 1_200, location: 'A01-04' },
    { materialId: 'IC-MCU-A7', onHand: 1_100, reserved: 90, location: 'B02-01' },
    { materialId: 'IC-PWR-24', onHand: 1_400, reserved: 120, location: 'B02-02' },
    { materialId: 'CON-M12', onHand: 3_000, reserved: 200, location: 'C01-01' },
    { materialId: 'CASE-AL', onHand: 1_600, reserved: 100, location: 'C02-02' },
  ]

  const supplies: SupplyRecord[] = [
    {
      id: DEMO_DELAYED_SUPPLY,
      materialId: DEMO_FOCUS_MATERIAL,
      quantity: 1_600,
      dueDate: '2026-08-19',
      supplier: '皓石电子（合成）',
      purchaseOrder: 'PO-260721-037',
    },
    {
      id: 'SUP-CAP-0828',
      materialId: DEMO_FOCUS_MATERIAL,
      quantity: 900,
      dueDate: '2026-08-28',
      supplier: '皓石电子（合成）',
      purchaseOrder: 'PO-260724-052',
    },
    {
      id: 'SUP-MCU-0811',
      materialId: 'IC-MCU-A7',
      quantity: 800,
      dueDate: '2026-08-11',
      supplier: '东衡半导体（合成）',
      purchaseOrder: 'PO-260718-014',
    },
  ]

  const orders: ProductionOrder[] = PRODUCT_NAMES.map((_, index) => ({
    id: `WO-2608-${String(index + 1).padStart(3, '0')}`,
    productId: `FG-${String(index + 1).padStart(3, '0')}`,
    quantity: 24 + ((index * 13) % 43),
    dueDate: `2026-08-${String(8 + (index % 20)).padStart(2, '0')}`,
    line: `L${(index % 4) + 1}`,
    customer: `${CUSTOMERS[index % CUSTOMERS.length]}（合成）`,
    customerTier: ((index % 3) + 1) as 1 | 2 | 3,
    latePenaltyPerDay: 900 + (index % 5) * 450,
  }))

  return {
    name: '岚桥智造 · 合成演示工厂',
    materials,
    bom,
    inventory,
    supplies,
    orders,
  }
}

