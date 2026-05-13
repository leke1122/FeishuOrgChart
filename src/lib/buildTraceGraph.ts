import { bitable } from '@lark-base-open/js-sdk'
import type { Edge, Node } from 'reactflow'
import type { TraceNodeData } from '../types/trace'
import { formatCellDisplay } from './cellDisplay'
import { extractLinkedRecordIds } from './linkFieldValue'

export const TRACE_MAX_DEPTH = 5

const NODE_X_GAP = 200
const NODE_Y_GAP = 96

type BitableTable = Awaited<ReturnType<typeof bitable.base.getTableById>>

export type TraceGraphResult = {
  nodes: Node<TraceNodeData>[]
  edges: Edge[]
  warnings: string[]
}

function dedupeEdgeKey(source: string, target: string) {
  return `${source}\0${target}`
}

/** 在「父 → 子」边上松弛：子为叶 depth=0，父 depth = min(子+1) */
export function computeDepthsFromLeaf(
  leafId: string,
  edges: Edge[],
  nodeIds: Set<string>,
): Map<string, number> {
  const depth = new Map<string, number>()
  for (const id of nodeIds) depth.set(id, 1e9)
  depth.set(leafId, 0)
  let changed = true
  let guard = 0
  while (changed && guard++ < nodeIds.size + edges.length + 2) {
    changed = false
    for (const e of edges) {
      const cd = depth.get(e.target)
      if (cd === undefined || cd === 1e9) continue
      const nd = cd + 1
      const pd = depth.get(e.source)
      if (pd === undefined || nd < pd) {
        depth.set(e.source, nd)
        changed = true
      }
    }
  }
  return depth
}

function layoutByDepth(
  nodeIds: string[],
  depthMap: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const byDepth = new Map<number, string[]>()
  for (const id of nodeIds) {
    const d = depthMap.get(id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(id)
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b)
  const maxD = depths.length ? Math.max(...depths) : 0
  for (const d of depths) {
    const row = byDepth.get(d) ?? []
    row.sort()
    const y = (maxD - d) * NODE_Y_GAP
    row.forEach((id, i) => {
      const x = (i - (row.length - 1) / 2) * NODE_X_GAP
      pos.set(id, { x, y })
    })
  }
  return pos
}

/**
 * 从起点记录沿指定关联字段向「上游」追溯，构建树状图数据（边方向：父 record → 子 record，叶为起点）。
 */
export async function buildTraceGraph(params: {
  table: BitableTable
  startRecordId: string
  linkFieldId: string
  primaryFieldId: string
}): Promise<TraceGraphResult> {
  const { table, startRecordId, linkFieldId, primaryFieldId } = params
  const warnings: string[] = []
  const edgeKeys = new Set<string>()
  const edges: Edge[] = []

  const titles = new Map<string, string>()

  async function loadTitle(recordId: string): Promise<string> {
    const cached = titles.get(recordId)
    if (cached !== undefined) return cached
    try {
      const rec = await table.getRecordById(recordId, true)
      const t = formatCellDisplay(rec.fields[primaryFieldId])
      titles.set(recordId, t)
      return t
    } catch {
      titles.set(recordId, recordId.slice(0, 10))
      return titles.get(recordId)!
    }
  }

  async function visit(recordId: string, pathDepth: number, stack: Set<string>): Promise<void> {
    if (stack.has(recordId)) {
      warnings.push('检测到环形关联，已在该分支截断。')
      return
    }
    if (pathDepth > TRACE_MAX_DEPTH) return

    stack.add(recordId)
    await loadTitle(recordId)

    if (pathDepth === TRACE_MAX_DEPTH) {
      stack.delete(recordId)
      return
    }

    let record: { fields: Record<string, unknown> }
    try {
      record = await table.getRecordById(recordId, true)
    } catch {
      warnings.push(`无法读取记录 ${recordId.slice(0, 8)}…，链路在此中断。`)
      stack.delete(recordId)
      return
    }

    const parents = extractLinkedRecordIds(record.fields[linkFieldId])
    if (parents.length === 0) {
      stack.delete(recordId)
      return
    }

    for (const p of parents) {
      if (p === recordId) continue
      const ek = dedupeEdgeKey(p, recordId)
      if (edgeKeys.has(ek)) continue
      edgeKeys.add(ek)
      edges.push({
        id: `e-${p}-${recordId}`,
        source: p,
        target: recordId,
        type: 'smoothstep',
      })
      await visit(p, pathDepth + 1, stack)
    }
    stack.delete(recordId)
  }

  await visit(startRecordId, 0, new Set())

  const nodeIds = new Set<string>([startRecordId])
  for (const e of edges) {
    nodeIds.add(e.source)
    nodeIds.add(e.target)
  }

  const depthMap = computeDepthsFromLeaf(startRecordId, edges, nodeIds)
  const positions = layoutByDepth([...nodeIds], depthMap)

  const nodes: Node<TraceNodeData>[] = []
  for (const recordId of nodeIds) {
    const p = positions.get(recordId) ?? { x: 0, y: 0 }
    const title = titles.get(recordId) ?? recordId.slice(0, 10)
    nodes.push({
      id: recordId,
      type: 'default',
      position: p,
      data: {
        recordId,
        title,
        targetFieldValue: null,
        isBlocked: false,
        reason: '',
        label: title,
      },
    })
  }

  return { nodes, edges, warnings }
}
