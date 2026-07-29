import { formatShortDate } from './date'
import type { DepartmentDirective, OrderExposure, SupplyRecord } from '../types'

interface DirectiveContext {
  materialId: string
  materialName: string
  totalShortage: number
  firstStopDate: string
  nextSupplyDate: string | null
  exposures: OrderExposure[]
  supply?: SupplyRecord
}

export function buildDirectives(context: DirectiveContext): DepartmentDirective[] {
  const impacted = context.exposures.filter((exposure) => exposure.shortage > 0)
  const lines = [...new Set(impacted.map((exposure) => exposure.order.line))]
  const workOrders = impacted.map((exposure) => exposure.order.id)
  const topOrders = [...impacted]
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 3)
    .map((exposure) => exposure.order.id)
  const supplyDate = context.nextSupplyDate ?? '尚无到货'
  const purchaseOrder = context.supply?.purchaseOrder ?? '待补采购单号'
  const supplier = context.supply?.supplier ?? '待补供应商'

  return [
    {
      id: 'procurement',
      department: '采购',
      title: `把 ${purchaseOrder} 拉到 ${formatShortDate(context.firstStopDate)} 前`,
      summary: `${supplier} 当前承诺 ${supplyDate}；至少需催回 ${context.totalShortage.toLocaleString()} pcs。`,
      payload: {
        action: 'expedite_purchase_order',
        material_id: context.materialId,
        purchase_order: purchaseOrder,
        supplier,
        current_due_date: supplyDate,
        required_date: context.firstStopDate,
        minimum_quantity: context.totalShortage,
      },
      prompt: `你是采购执行员。请立即联系 ${supplier}，针对采购单 ${purchaseOrder} 的 ${context.materialId}（${context.materialName}）确认分批交付方案。当前到货日 ${supplyDate}，产线最晚需求日 ${context.firstStopDate}，需在该日前至少到货 ${context.totalShortage.toLocaleString()} pcs。输出：供应商口头确认、可提前数量、最早到厂日、今日下一次跟催时间。不得自行更改数量或日期。`,
    },
    {
      id: 'production',
      department: '产线',
      title: `${lines.join(' / ')} 在断料日前切换排产`,
      summary: `冻结 ${workOrders.length} 张受影响工单，优先保 ${topOrders.join('、')}。`,
      payload: {
        action: 'resequence_lines',
        material_id: context.materialId,
        affected_lines: lines,
        freeze_work_orders: workOrders,
        protect_work_orders: topOrders,
        switch_before: context.firstStopDate,
      },
      prompt: `你是生产调度员。${context.materialId} 将在 ${context.firstStopDate} 形成缺口。请在 ${lines.join('、')} 线执行换排：冻结 ${workOrders.join('、')}，优先保供 ${topOrders.join('、')}。在不改变 BOM、不拆用未授权在制品的前提下，给出各线从当前工单切换到安全工单的时间、清线要求与班组确认人。`,
    },
    {
      id: 'warehouse',
      department: '仓库',
      title: `封存现货，按保供清单发料`,
      summary: `对 ${context.materialId} 停止自由领料；盘点、预留、跨库位调拨一次完成。`,
      payload: {
        action: 'reserve_and_transfer',
        material_id: context.materialId,
        reserve_for: topOrders,
        stop_free_issue: true,
        physical_count_required: true,
      },
      prompt: `你是仓库主管。立即对 ${context.materialId}（${context.materialName}）执行实盘并停止自由领料。仅对 ${topOrders.join('、')} 预留发料；核对所有库位、待检区与线边仓，回报可调拨数量、批次、库位和完成时间。任何账实差异单列，不得用估算数覆盖实盘数。`,
    },
    {
      id: 'planning',
      department: '计划',
      title: `重排 ${workOrders.length} 张工单并锁定承诺版本`,
      summary: `按客户等级、日罚款和交期重算；到货一变，全图再跑。`,
      payload: {
        action: 'replan_work_orders',
        material_id: context.materialId,
        impacted_work_orders: workOrders,
        priority_order: topOrders,
        material_event: context.materialId,
        recalculate_on_supply_change: true,
      },
      prompt: `你是计划员。围绕 ${context.materialId} 缺料事件重排 ${workOrders.length} 张工单。先保护 ${topOrders.join('、')}，其余按客户等级、日违约成本、原交期排序。输出新开工/完工日、客户承诺变更和需采购确认的前置条件。采购到货日期发生任何变化后，必须重新运行本推演，不得沿用旧表。`,
    },
  ]
}
