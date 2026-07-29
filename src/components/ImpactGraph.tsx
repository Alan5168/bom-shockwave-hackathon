import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node } from '@xyflow/react'
import type { ShockAnalysis } from '../types'

function ShockNode({
  data,
}: {
  data: { label: string; meta: string; tone: 'source' | 'product' | 'line' | 'customer' }
}) {
  return (
    <div className={`shock-node shock-node--${data.tone}`}>
      <Handle type="target" position={Position.Left} />
      <span>{data.meta}</span>
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { shock: ShockNode }

export function ImpactGraph({ analysis }: { analysis: ShockAnalysis }) {
  const impacted = analysis.exposures.filter((exposure) => exposure.shortage > 0).slice(0, 8)
  const lines = [...new Set(impacted.map((exposure) => exposure.order.line))]
  const customers = [...new Set(impacted.map((exposure) => exposure.order.customer))].slice(0, 4)
  const nodes: Node[] = [
    {
      id: 'material',
      type: 'shock',
      position: { x: 20, y: 190 },
      data: {
        label: analysis.materialId,
        meta: `缺 ${Math.round(analysis.totalShortage).toLocaleString()} pcs`,
        tone: 'source',
      },
    },
    ...impacted.map((exposure, index) => ({
      id: `product-${exposure.order.productId}`,
      type: 'shock',
      position: { x: 285, y: 20 + index * 76 },
      data: {
        label: exposure.productName,
        meta: `${exposure.order.id} · 缺 ${Math.ceil(exposure.shortage)}`,
        tone: 'product' as const,
      },
    })),
    ...lines.map((line, index) => ({
      id: `line-${line}`,
      type: 'shock',
      position: { x: 585, y: 70 + index * 132 },
      data: {
        label: `${line} 产线`,
        meta: '换排 / 待料',
        tone: 'line' as const,
      },
    })),
    ...customers.map((customer, index) => ({
      id: `customer-${customer}`,
      type: 'shock',
      position: { x: 850, y: 70 + index * 132 },
      data: {
        label: customer.replace('（合成）', ''),
        meta: '交期承诺受影响',
        tone: 'customer' as const,
      },
    })),
  ]

  const edges: Edge[] = [
    ...impacted.map((exposure) => ({
      id: `material-${exposure.order.id}`,
      source: 'material',
      target: `product-${exposure.order.productId}`,
      animated: true,
      style: { stroke: '#ec6a3d', strokeWidth: 1.8 },
    })),
    ...impacted.map((exposure) => ({
      id: `product-line-${exposure.order.id}`,
      source: `product-${exposure.order.productId}`,
      target: `line-${exposure.order.line}`,
      style: { stroke: '#c5b9a0', strokeWidth: 1.2 },
    })),
    ...impacted.map((exposure) => ({
      id: `line-customer-${exposure.order.id}`,
      source: `line-${exposure.order.line}`,
      target: `customer-${exposure.order.customer}`,
      style: { stroke: '#c5b9a0', strokeWidth: 1.2 },
    })),
  ]

  return (
    <div className="impact-graph" aria-label="缺料冲击传播图">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.55}
        maxZoom={1.3}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d9d1bf" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

