import { formatCellDisplay } from './cellDisplay'

/** 侧栏下拉里的「名称（类型）」→ 仅名称，便于结论文案阅读 */
export function shortFieldLabel(full: string): string {
  const m = full.match(/^(.+?)（[^）]+）$/)
  return m ? m[1].trim() : full.trim()
}

/**
 * 单节点未达标时的可读原因（与画布节点 reason 一致逻辑，句子更完整）
 */
export function formatMismatchReason(params: {
  recordDisplayTitle: string
  targetFieldLabel?: string
  raw: unknown
  expectedTrimmed: string
}): string {
  const { recordDisplayTitle, targetFieldLabel, raw, expectedTrimmed } = params
  const actual = formatCellDisplay(raw)
  const name = targetFieldLabel
    ? `「${shortFieldLabel(targetFieldLabel)}」`
    : '目标字段'
  return `记录「${recordDisplayTitle}」的${name}当前展示为「${actual}」，规则要求等于「${expectedTrimmed}」，二者不一致。`
}

/** 目标字段名像「编号」但目标值像状态文案时的配置提示 */
export function suggestTargetFieldMismatchHint(
  targetFieldLabel: string | undefined,
  expectedTrimmed: string,
): string | null {
  if (!targetFieldLabel || !expectedTrimmed) return null
  const name = shortFieldLabel(targetFieldLabel)
  if (!name.includes('编号') && !name.includes('单号') && !name.includes('号')) return null
  if (!/[\u4e00-\u9fa5]{2,}/.test(expectedTrimmed)) return null
  if (/^[A-Za-z0-9_-]{3,}$/.test(expectedTrimmed)) return null
  return `配置提示：当前「目标字段」为「${name}」，而「目标值」更像状态/结果类文案。若实际想判断的是订单是否完成，请把「目标字段」改为「订单状态」等字段，并把「目标值」填成该列在表格里出现的原文（与单元格展示一致）。`
}
