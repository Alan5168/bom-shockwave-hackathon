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
  redesignDays: number
  redesignCost: number
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
  const customerOrders = [...impacted]
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 5)
    .map((exposure) => ({
      work_order: exposure.order.id,
      customer: exposure.order.customer,
      original_due_date: exposure.order.dueDate,
      projected_finish_date: exposure.projectedFinishDate,
      delay_days: exposure.delayDays,
      estimated_penalty: Math.round(exposure.penalty),
    }))
  const customers = [...new Set(impacted.map((exposure) => exposure.order.customer))]
  const customerBrief = customerOrders
    .map(
      (item) =>
        `${item.work_order}/${item.customer}：预计 ${item.projected_finish_date}，晚 ${item.delay_days} 天`,
    )
    .join('；')

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
    {
      id: 'engineering',
      department: '研发',
      title: `在 ${context.redesignDays} 天验证窗内给出替代料放行结论`,
      summary: `验证预算上限 ¥${context.redesignCost.toLocaleString()}；未经研发、质量共同签字不得替换 BOM。`,
      payload: {
        action: 'qualify_substitute_material',
        material_id: context.materialId,
        material_name: context.materialName,
        shortage_quantity: context.totalShortage,
        line_stop_date: context.firstStopDate,
        qualification_days: context.redesignDays,
        budget_cap: context.redesignCost,
        required_outputs: [
          'candidate_cross_reference',
          'spec_delta',
          'test_matrix',
          'earliest_release_date',
          'engineering_and_quality_approval',
        ],
        unapproved_substitution_forbidden: true,
      },
      prompt: `你是研发负责人。针对 ${context.materialId}（${context.materialName}）缺口 ${context.totalShortage.toLocaleString()} pcs，在不超过 ${context.redesignDays} 天、预算不超过 ¥${context.redesignCost.toLocaleString()} 的条件下启动替代料评估；产线最早断料日为 ${context.firstStopDate}。请输出：候选料号与供应可得量、关键规格逐项差异、硬件/可靠性/工艺测试矩阵、样品与测试负责人、最早可放行日期、需要客户或认证方批准的变更。未经研发与质量共同签字，不得改 BOM、不得口头放行。若验证窗晚于断料日，明确标注“不能作为本次救火主方案”。`,
    },
    {
      id: 'sales',
      department: '销售',
      title: `在违约前重谈 ${customers.length} 个客户的交期承诺`,
      summary: `先处理预计罚款最高的 ${customerOrders.length} 张工单；不得承诺早于计划预计完工日。`,
      payload: {
        action: 'renegotiate_customer_commitments',
        material_event: context.materialId,
        affected_customers: customers,
        priority_orders: customerOrders,
        earliest_line_stop_date: context.firstStopDate,
        promises_require_planning_confirmation: true,
      },
      prompt: `你是销售负责人。${context.materialId} 缺料已影响 ${customers.length} 个客户、${workOrders.length} 张工单。优先沟通：${customerBrief}。请逐客户输出：合同承诺与罚则核对、可接受最晚日期、分批交付选项、是否能协助客户侧调货、今日联系人和下一次确认时间。所有新承诺必须引用计划部门给出的预计完工日，不得为了安抚客户擅自承诺更早日期；客户口头同意必须转成可追踪书面确认。`,
    },
    {
      id: 'logistics',
      department: '物流',
      title: `为 ${purchaseOrder} 建立分批提货与入厂时间表`,
      summary: `目标是在 ${formatShortDate(context.firstStopDate)} 前把至少 ${context.totalShortage.toLocaleString()} pcs 送达可用库位。`,
      payload: {
        action: 'expedite_inbound_logistics',
        material_id: context.materialId,
        purchase_order: purchaseOrder,
        supplier,
        current_supplier_due_date: supplyDate,
        factory_required_date: context.firstStopDate,
        minimum_usable_quantity: context.totalShortage,
        milestones: [
          'supplier_goods_ready',
          'pickup_confirmed',
          'in_transit',
          'factory_gate_arrival',
          'inspection_release',
          'warehouse_putaway',
        ],
      },
      prompt: `你是入厂物流负责人。围绕 ${supplier} 的采购单 ${purchaseOrder}，为 ${context.materialId} 建立分批提货与入厂方案。供应商当前承诺 ${supplyDate}，工厂要求 ${context.firstStopDate} 前至少有 ${context.totalShortage.toLocaleString()} pcs 完成到厂、检验放行并进入可发料库位。请输出：供应商齐套时间、首批/后续批次数量、提货时间、运输方式与在途时长、承运人、到厂门岗时间、检验与入库衔接、每个里程碑的负责人和异常升级点。不要把“已发货”当作“已可用”，最终节点必须是检验放行并入库。`,
    },
  ]
}
