import type { Edge, Node } from 'reactflow'
import type { TraceNodeData } from '../types/trace'
import { formatCellDisplay } from './cellDisplay'
import { formatMismatchReason } from './diagnosisReason'
import { cellMatchesTarget } from './targetMatch'
import { computeDepthsFromLeaf } from './buildTraceGraph'

export type RecordSnapshot = { fields: Record<string, unknown> }

export type DiagnosisResult = {
  nodes: Node<TraceNodeData>[]
  summary: string
  /** 从链路根向下第一个未达标节点 */
  rootFirstBlockedTitle: string | null
  rootFirstBlockedReason: string | null
  /** 距当前记录（叶）最近的未达标节点（深度最小） */
  nearestBlockedTitle: string | null
  nearestBlockedReason: string | null
  blockedCount: number
}

function nodeStyle(isDiagnosing: boolean, isBlocked: boolean) {
  if (!isDiagnosing) {
    return {
      border: '1px solid #d9d9d9',
      borderRadius: 8,
      padding: 8,
      background: '#fff',
    } as const
  }
  if (isBlocked) {
    return {
      border: '2px solid #ff4d4f',
      borderRadius: 8,
      padding: 8,
      background: '#fff2f0',
    } as const
  }
  return {
    border: '2px solid #52c41a',
    borderRadius: 8,
    padding: 8,
    background: '#f6ffed',
  } as const
}

export function applyTargetDiagnosis(params: {
  traceNodes: Node<TraceNodeData>[]
  snapshots: Map<string, RecordSnapshot>
  targetFieldId: string | undefined
  targetValue: string
  edges: Edge[]
  leafRecordId: string
  /** 侧栏目标字段展示名，如「订单编号（文本）」 */
  targetFieldLabel?: string
}): DiagnosisResult {
  const {
    traceNodes,
    snapshots,
    targetFieldId,
    targetValue,
    edges,
    leafRecordId,
    targetFieldLabel,
  } = params
  const trimmed = targetValue.trim()
  const diagnosing = Boolean(targetFieldId && trimmed !== '')

  const depthMap = computeDepthsFromLeaf(
    leafRecordId,
    edges,
    new Set(traceNodes.map((n) => n.id)),
  )

  const out: Node<TraceNodeData>[] = []
  const blockedTitles: string[] = []

  for (const n of traceNodes) {
    const snap = snapshots.get(n.data.recordId)
    const raw =
      targetFieldId && snap ? snap.fields[targetFieldId] : undefined

    let isBlocked = false
    let reason = ''
    if (diagnosing && snap && targetFieldId) {
      isBlocked = !cellMatchesTarget(raw, trimmed)
      if (isBlocked) {
        reason = formatMismatchReason({
          recordDisplayTitle: n.data.title,
          targetFieldLabel,
          raw,
          expectedTrimmed: trimmed,
        })
        blockedTitles.push(n.data.title)
      }
    }

    const secondLine =
      diagnosing && targetFieldId
        ? formatCellDisplay(raw)
        : undefined
    const label = secondLine ? `${n.data.title}\n${secondLine}` : n.data.title

    out.push({
      ...n,
      className: diagnosing
        ? isBlocked
          ? 'trace-node trace-node--blocked'
          : 'trace-node trace-node--ok'
        : 'trace-node',
      style: nodeStyle(diagnosing, isBlocked),
      data: {
        ...n.data,
        targetFieldValue: raw ?? null,
        isBlocked,
        reason,
        label,
      },
    })
  }

  let summary: string
  if (!diagnosing) {
    summary = '请选择目标字段并填写目标值后，将按规则高亮卡点（绿：达标，红：未达标）。'
  } else if (blockedTitles.length === 0) {
    summary = '链路上所有节点均满足目标条件。'
  } else {
    summary = `未达标节点（${blockedTitles.length}）：${blockedTitles.join('、')}`
  }

  const blockedNodes = out.filter((n) => n.data.isBlocked)
  const blockedCount = blockedNodes.length

  let rootFirstBlockedTitle: string | null = null
  let rootFirstBlockedReason: string | null = null
  let nearestBlockedTitle: string | null = null
  let nearestBlockedReason: string | null = null

  if (blockedNodes.length > 0) {
    const byDepthDesc = [...blockedNodes].sort(
      (a, b) =>
        (depthMap.get(b.data.recordId) ?? 0) -
        (depthMap.get(a.data.recordId) ?? 0),
    )
    const rootFirst = byDepthDesc[0]
    rootFirstBlockedTitle = rootFirst?.data.title ?? null
    rootFirstBlockedReason = rootFirst?.data.reason ?? null

    const byDepthAsc = [...blockedNodes].sort(
      (a, b) =>
        (depthMap.get(a.data.recordId) ?? 0) -
        (depthMap.get(b.data.recordId) ?? 0),
    )
    const nearest = byDepthAsc[0]
    nearestBlockedTitle = nearest?.data.title ?? null
    nearestBlockedReason = nearest?.data.reason ?? null
  }

  return {
    nodes: out,
    summary,
    rootFirstBlockedTitle,
    rootFirstBlockedReason,
    nearestBlockedTitle,
    nearestBlockedReason,
    blockedCount,
  }
}
