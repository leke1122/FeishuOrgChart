import { checkers } from '@lark-base-open/js-sdk'

/** 从关联 / 查找引用等单元格值中收集指向的 recordId（去重保序） */
export function extractLinkedRecordIds(value: unknown): string[] {
  const acc: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    acc.push(id)
  }

  const walk = (v: unknown) => {
    if (v === null || v === undefined) return
    if (checkers.isLink(v)) {
      for (const id of v.recordIds) push(id)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
    }
  }

  walk(value)
  return acc
}
