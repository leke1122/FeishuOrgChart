export type StorageSelection = {
  baseId: string | null
  tableId: string | null
  viewId: string | null
}

const PREFIX = 'feishu-bitable-rcd'

export type DiagnosisPrefs = {
  targetFieldId?: string
  targetValue?: string
}

export function diagnosisStorageKey(sel: StorageSelection) {
  return `${PREFIX}:${sel.baseId ?? ''}:${sel.tableId ?? ''}:${sel.viewId ?? ''}`
}

export function loadDiagnosisPrefs(sel: StorageSelection | null): DiagnosisPrefs {
  if (!sel?.tableId) return {}
  try {
    const raw = localStorage.getItem(diagnosisStorageKey(sel))
    if (!raw) return {}
    return JSON.parse(raw) as DiagnosisPrefs
  } catch {
    return {}
  }
}

export function saveDiagnosisPrefs(
  sel: StorageSelection | null,
  prefs: DiagnosisPrefs,
): void {
  if (!sel?.tableId) return
  try {
    localStorage.setItem(diagnosisStorageKey(sel), JSON.stringify(prefs))
  } catch {
    // 忽略配额或隐私模式
  }
}
