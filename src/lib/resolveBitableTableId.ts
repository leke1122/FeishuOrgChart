import { bitable } from '@lark-base-open/js-sdk'

const TBL_ID_RE = /^tbl[\w]+$/i

function fromParams(sp: URLSearchParams): string | null {
  const t = sp.get('table')
  return t && TBL_ID_RE.test(t) ? t : null
}

/** 当前 iframe 地址上的 ?table= / #...?table=（部分宿主会把上下文拼在插件 URL 上） */
export function parseTableIdFromBrowserLocation(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const q = fromParams(new URLSearchParams(window.location.search))
    if (q) return q
    const hash = window.location.hash
    const i = hash.indexOf('?')
    if (i !== -1) {
      return fromParams(new URLSearchParams(hash.slice(i + 1)))
    }
  } catch {
    /* noop */
  }
  return null
}

/** 飞书内嵌 iframe 时，referrer 常为父页面（Wiki / Base）链接，可带 table=tbl… */
export function parseTableIdFromReferrer(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null
  try {
    return fromParams(new URL(document.referrer).searchParams)
  } catch {
    return null
  }
}

export type TableIdResolveSource =
  | 'selection'
  | 'location'
  | 'referrer'
  | 'meta_single'
  | 'none'

export type TableIdResolveResult = {
  tableId: string | null
  source: TableIdResolveSource
  /** 来自 getTableMetaList 时的表名，用于提示 */
  tableNameHint?: string
}

/**
 * 数据表视图等场景下 getSelection().tableId 可能长时间为 null；
 * 依次尝试：选区 → 本页 URL → document.referrer → Base 内表元信息。
 */
export async function resolveBitableTableId(
  selectionTableId: string | null,
): Promise<TableIdResolveResult> {
  if (selectionTableId && TBL_ID_RE.test(selectionTableId)) {
    return { tableId: selectionTableId, source: 'selection' }
  }
  const fromLoc = parseTableIdFromBrowserLocation()
  if (fromLoc) return { tableId: fromLoc, source: 'location' }
  const fromRef = parseTableIdFromReferrer()
  if (fromRef) return { tableId: fromRef, source: 'referrer' }
  try {
    const metas = await bitable.base.getTableMetaList()
    if (metas.length === 1) {
      return {
        tableId: metas[0].id,
        source: 'meta_single',
        tableNameHint: metas[0].name,
      }
    }
    if (metas.length > 1) {
      return { tableId: null, source: 'none' }
    }
  } catch {
    /* noop */
  }
  return { tableId: null, source: 'none' }
}
