import type { Edge, Node } from 'reactflow'

/** 链路图节点（与产品说明一致，后续 Phase 3–5 使用） */
export interface TraceNodeData {
  recordId: string
  title: string
  targetFieldValue: unknown
  isBlocked: boolean
  reason: string
  /** 供 React Flow 默认节点渲染 */
  label?: string
}

export type TraceNode = Node<TraceNodeData, string | undefined>
export type TraceEdge = Edge
