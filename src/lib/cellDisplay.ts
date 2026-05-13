/** 将单元格值格式化为简短标题（用于「当前诊断」展示） */
export function formatCellDisplay(value: unknown): string {
  if (value === null || value === undefined) return '（空）'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatCellDisplay).join('、')
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    if (typeof o.name === 'string') return o.name
  }
  return '…'
}
