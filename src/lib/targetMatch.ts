import { checkers } from '@lark-base-open/js-sdk'
import { formatCellDisplay } from './cellDisplay'

/** 判断单元格是否满足用户输入的目标值（trim 后比较） */
export function cellMatchesTarget(value: unknown, expected: string): boolean {
  const t = expected.trim()
  if (t === '') return true
  if (checkers.isEmpty(value)) {
    return t === '（空）' || t === '' || t === '空'
  }
  if (checkers.isSingleSelect(value)) {
    return value.text === t || value.id === t
  }
  if (checkers.isMultiSelect(value)) {
    return value.map((x) => x.text).join('、') === t
  }
  if (checkers.isCheckbox(value)) {
    if (t === '是' || t.toLowerCase() === 'true' || t === '1') return value === true
    if (t === '否' || t.toLowerCase() === 'false' || t === '0') return value === false
    return String(value) === t
  }
  if (checkers.isNumber(value)) {
    return String(value) === t
  }
  if (checkers.isTimestamp(value)) {
    return String(value) === t
  }
  return formatCellDisplay(value) === t
}
