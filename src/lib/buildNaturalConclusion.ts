export type NaturalConclusionParams = {
  recordTitle: string
  recordId?: string | null
  /** 已选择追踪维度且已生成链路 */
  hasTrace: boolean
  linkFieldSelected: boolean
  /** 已选目标字段且目标值非空 */
  diagnosing: boolean
  targetFieldName?: string
  targetValueTrimmed: string
  blockedCount: number
  rootFirstBlockedTitle: string | null
  rootFirstBlockedReason: string | null
  nearestBlockedTitle: string | null
  nearestBlockedReason: string | null
}

/**
 * Phase 5：面向侧栏展示的自然语言诊断结论（与画布高亮一致）。
 */
export function buildNaturalConclusion(p: NaturalConclusionParams): string {
  if (!p.recordId) {
    return '请先在多维表格中选中一行记录，再查看诊断结论。'
  }
  if (!p.linkFieldSelected || !p.hasTrace) {
    return '请先在左侧选择「追踪字段」并在表格中选中一行以生成上游链路；链路就绪后再配置目标字段与目标值，即可在此生成诊断结论文案。'
  }
  if (!p.diagnosing) {
    return '请配置「目标字段」与「目标值」。系统将遍历链路上各节点并与目标比对，在本区域输出结论文案，同时在画布上以绿色（达标）与红色（未达标）标示。'
  }

  const fieldLabel = p.targetFieldName ?? '目标字段'
  const cond = `在「${fieldLabel}」需满足「${p.targetValueTrimmed}」的前提下`

  if (p.blockedCount === 0) {
    return `诊断结果：${cond}，当前记录「${p.recordTitle}」及其上游链路全部达标，未发现卡点。`
  }

  const root = p.rootFirstBlockedTitle ?? '上游节点'
  const rootDetail = p.rootFirstBlockedReason ? `${p.rootFirstBlockedReason}` : ''
  let text = `诊断结果：${cond}，从链路根向当前记录「${p.recordTitle}」追溯，「${root}」为首个未达标卡点`
  if (rootDetail) text += `：${rootDetail}`
  text += '。'

  const near = p.nearestBlockedTitle
  if (near && near !== p.rootFirstBlockedTitle) {
    const nearDetail = p.nearestBlockedReason ? `${p.nearestBlockedReason}` : ''
    text += `距离当前记录更近的未达标节点为「${near}」`
    if (nearDetail) text += `（${nearDetail}）`
    text += '。'
  }

  text += `建议优先在表中处理上述卡点，以改善「${p.recordTitle}」的达成条件。`
  return text
}
