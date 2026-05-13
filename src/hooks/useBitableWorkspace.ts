import { useCallback, useEffect, useRef, useState } from 'react'
import { bitable, FieldType, WidgetBaseEvent } from '@lark-base-open/js-sdk'
import { formatCellDisplay } from '../lib/cellDisplay'

/** 与 SDK Selection 对齐，避免依赖未导出的类型名 */
export type PluginSelection = {
  baseId: string | null
  tableId: string | null
  viewId: string | null
  fieldId: string | null
  recordId: string | null
}

const LINK_FIELD_TYPES = new Set([
  FieldType.SingleLink,
  FieldType.DuplexLink,
  FieldType.Lookup,
])

function fieldTypeLabel(t: FieldType): string {
  switch (t) {
    case FieldType.SingleLink:
      return '单向关联'
    case FieldType.DuplexLink:
      return '双向关联'
    case FieldType.Lookup:
      return '查找引用'
    default:
      return '关联'
  }
}

export type LinkFieldOption = {
  id: string
  name: string
  type: FieldType
}

export type ScalarFieldOption = {
  id: string
  name: string
}

export function useBitableWorkspace() {
  const [hostError, setHostError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PluginSelection | null>(null)
  const [recordTitle, setRecordTitle] = useState<string>('')
  const [linkFields, setLinkFields] = useState<LinkFieldOption[]>([])
  const [scalarFields, setScalarFields] = useState<ScalarFieldOption[]>([])
  const [linkFieldId, setLinkFieldId] = useState<string | undefined>()
  const [primaryFieldId, setPrimaryFieldId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mounted = useRef(true)

  const applySelection = useCallback(async (sel: PluginSelection) => {
    if (!mounted.current) return
    setSelection(sel)
    setLinkFieldId(undefined)
    setLinkFields([])
    setScalarFields([])

    if (!sel.tableId) {
      setRecordTitle('')
      setHostError('无法获取当前数据表，请在多维表格中重新打开插件。')
      return
    }

    if (!sel.recordId) {
      setRecordTitle('')
      setPrimaryFieldId(null)
      setHostError(null)
      return
    }

    setLoading(true)
    setHostError(null)
    try {
      const table = await bitable.base.getTableById(sel.tableId)
      const [record, metas] = await Promise.all([
        table.getRecordById(sel.recordId, true),
        table.getFieldMetaList(),
      ])
      const primary =
        metas.find((m) => m.isPrimary) ??
        metas.find((m) => m.type === FieldType.Text)
      const title = primary
        ? formatCellDisplay(record.fields[primary.id])
        : sel.recordId.slice(0, 8)
      const links: LinkFieldOption[] = metas
        .filter((m) => LINK_FIELD_TYPES.has(m.type))
        .map((m) => ({ id: m.id, name: m.name, type: m.type }))
      const scalars: ScalarFieldOption[] = metas
        .filter((m) => !LINK_FIELD_TYPES.has(m.type))
        .map((m) => ({ id: m.id, name: m.name }))
      if (!mounted.current) return
      setRecordTitle(title)
      setPrimaryFieldId(primary?.id ?? null)
      setLinkFields(links)
      setScalarFields(scalars)
    } catch (e) {
      if (!mounted.current) return
      setRecordTitle('')
      setLinkFields([])
      setScalarFields([])
      setPrimaryFieldId(null)
      setHostError(e instanceof Error ? e.message : '读取记录或字段失败')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const refreshFromHost = useCallback(async () => {
    try {
      const sel = await bitable.base.getSelection()
      await applySelection(sel)
    } catch {
      setHostError('请在飞书多维表格中通过「插件」打开本应用（本地浏览器直接打开无法访问多维表数据）。')
    }
  }, [applySelection])

  useEffect(() => {
    mounted.current = true
    let unsubSelection: (() => void) | undefined
    let registered = false

    const setup = async () => {
      try {
        await bitable.base.registerBaseEvent(WidgetBaseEvent.SelectionChange)
        registered = true
      } catch {
        // 非宿主环境可能失败，仍尝试监听 onSelectionChange
      }
      unsubSelection = bitable.base.onSelectionChange((e) => {
        void applySelection(e.data)
      })
      await refreshFromHost()
    }

    void setup()

    return () => {
      mounted.current = false
      unsubSelection?.()
      if (registered) {
        void bitable.base.unregisterBaseEvent(WidgetBaseEvent.SelectionChange).catch(() => {})
      }
    }
  }, [applySelection, refreshFromHost])

  const linkFieldOptions = linkFields.map((f) => ({
    value: f.id,
    label: `${f.name}（${fieldTypeLabel(f.type)}）`,
  }))

  const scalarFieldOptions = scalarFields.map((f) => ({
    value: f.id,
    label: f.name,
  }))

  return {
    hostError,
    selection,
    recordTitle,
    linkFieldId,
    setLinkFieldId,
    linkFieldOptions,
    scalarFieldOptions,
    loading,
    primaryFieldId,
  }
}
