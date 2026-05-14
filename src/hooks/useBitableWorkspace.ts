import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bitable, FieldType, WidgetBaseEvent } from '@lark-base-open/js-sdk'
import { formatCellDisplay } from '../lib/cellDisplay'
import {
  resolveBitableTableId,
  parseTableIdFromBrowserLocation,
  parseTableIdFromReferrer,
  type TableIdResolveResult,
} from '../lib/resolveBitableTableId'

/** 与 SDK Selection 对齐，避免依赖未导出的类型名 */
export type PluginSelection = {
  baseId: string | null
  tableId: string | null
  viewId: string | null
  fieldId: string | null
  recordId: string | null
}

/** 用于下拉展示：所有字段类型可读名称 */
export function traceFieldTypeLabel(t: FieldType): string {
  switch (t) {
    case FieldType.SingleLink:
      return '单向关联'
    case FieldType.DuplexLink:
      return '双向关联'
    case FieldType.Lookup:
      return '查找引用'
    case FieldType.Text:
      return '文本'
    case FieldType.Number:
      return '数字'
    case FieldType.SingleSelect:
      return '单选'
    case FieldType.MultiSelect:
      return '多选'
    case FieldType.DateTime:
      return '日期'
    case FieldType.Checkbox:
      return '复选框'
    case FieldType.User:
      return '人员'
    case FieldType.Phone:
      return '电话'
    case FieldType.Url:
      return '链接'
    case FieldType.Attachment:
      return '附件'
    case FieldType.Formula:
      return '公式'
    case FieldType.Location:
      return '地理位置'
    case FieldType.GroupChat:
      return '群组'
    case FieldType.Object:
      return '对象'
    case FieldType.CreatedTime:
      return '创建时间'
    case FieldType.ModifiedTime:
      return '修改时间'
    case FieldType.CreatedUser:
      return '创建人'
    case FieldType.ModifiedUser:
      return '修改人'
    case FieldType.AutoNumber:
      return '自动编号'
    case FieldType.Email:
      return '邮箱'
    case FieldType.Barcode:
      return '条码'
    case FieldType.Progress:
      return '进度'
    case FieldType.Currency:
      return '货币'
    case FieldType.Rating:
      return '评分'
    case FieldType.NotSupport:
    case FieldType.Denied:
    default:
      return `类型${t}`
  }
}

export type TraceFieldOption = {
  id: string
  name: string
  type: FieldType
}

export type ScalarFieldOption = {
  id: string
  name: string
  type: FieldType
}

export type BaseTableOption = {
  id: string
  name: string
}

export function useBitableWorkspace() {
  const [hostError, setHostError] = useState<string | null>(null)
  const [tableContextHint, setTableContextHint] = useState<string | null>(null)
  const [selection, setSelection] = useState<PluginSelection | null>(null)
  const [suggestedTableId, setSuggestedTableId] = useState<string | null>(null)
  const [baseTables, setBaseTables] = useState<BaseTableOption[]>([])
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const tablePickLockedRef = useRef(false)

  const [recordTitle, setRecordTitle] = useState<string>('')
  const [traceFields, setTraceFields] = useState<TraceFieldOption[]>([])
  const [linkFieldId, setLinkFieldId] = useState<string | undefined>()
  const [primaryFieldId, setPrimaryFieldId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mounted = useRef(true)

  /** 宿主建议的表（选区 / 链接），用于在未手动锁表时自动对齐 */
  const applyHostSelection = useCallback(async (sel: PluginSelection) => {
    if (!mounted.current) return
    let resolved: TableIdResolveResult
    try {
      resolved = await resolveBitableTableId(sel.tableId)
    } catch {
      resolved = { tableId: null, source: 'none' }
    }
    setSuggestedTableId(resolved.tableId)
    setSelection({
      ...sel,
      tableId: resolved.tableId,
    })
  }, [])

  /** 加载子表列表（整个 Base） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const metas = await bitable.base.getTableMetaList()
        if (cancelled) return
        setBaseTables(metas.map((m) => ({ id: m.id, name: m.name })))
      } catch {
        if (!cancelled) setBaseTables([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 未手动选表时：用建议 / 链接 / 单表 自动确定 activeTableId */
  useEffect(() => {
    if (tablePickLockedRef.current) return
    if (baseTables.length === 0) return
    const inList = (id: string | null) =>
      id && baseTables.some((t) => t.id === id) ? id : null
    const fromUrl =
      inList(parseTableIdFromBrowserLocation()) ??
      inList(parseTableIdFromReferrer())
    const pick =
      inList(suggestedTableId) ?? fromUrl ?? (baseTables.length === 1 ? baseTables[0].id : null)
    if (pick && pick !== activeTableId) {
      setActiveTableId(pick)
    }
    if (!pick && baseTables.length > 1) {
      setActiveTableId(null)
      setTableContextHint(
        '当前多维表含多张工作表，请先在下方「数据表」中选择要诊断的子表。',
      )
    }
    if (pick) {
      setTableContextHint(null)
    }
  }, [baseTables, suggestedTableId, activeTableId])

  const setActiveTableIdFromUser = useCallback((id: string | null) => {
    tablePickLockedRef.current = true
    setActiveTableId(id)
    setLinkFieldId(undefined)
  }, [])

  /** 按当前子表 + 选区加载字段与记录标题 */
  useEffect(() => {
    if (!activeTableId) {
      setRecordTitle('')
      setPrimaryFieldId(null)
      setTraceFields([])
      setHostError(null)
      return
    }

    const recordId = selection?.recordId ?? null
    let cancelled = false
    setLoading(true)
    setHostError(null)

    void (async () => {
      try {
        const table = await bitable.base.getTableById(activeTableId)
        const metas = await table.getFieldMetaList()
        const primary =
          metas.find((m) => m.isPrimary) ??
          metas.find((m) => m.type === FieldType.Text)

        const trace: TraceFieldOption[] = metas.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
        }))

        if (!recordId) {
          if (!cancelled) {
            setRecordTitle('')
            setPrimaryFieldId(primary?.id ?? null)
            setTraceFields(trace)
          }
          return
        }

        const record = await table.getRecordById(recordId, true)
        const title = primary
          ? formatCellDisplay(record.fields[primary.id])
          : recordId.slice(0, 8)
        if (!cancelled) {
          setRecordTitle(title)
          setPrimaryFieldId(primary?.id ?? null)
          setTraceFields(trace)
        }
      } catch (e) {
        if (!cancelled) {
          setRecordTitle('')
          setTraceFields([])
          setPrimaryFieldId(null)
          setHostError(e instanceof Error ? e.message : '读取记录或字段失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTableId, selection?.recordId])

  const refreshFromHost = useCallback(async () => {
    try {
      const sel = await bitable.base.getSelection()
      await applyHostSelection(sel)
    } catch {
      setHostError(
        '请在飞书多维表格中通过「插件」打开本应用（本地浏览器直接打开无法访问多维表数据）。',
      )
    }
  }, [applyHostSelection])

  useEffect(() => {
    mounted.current = true
    let unsubSelection: (() => void) | undefined
    let registered = false

    const setup = async () => {
      try {
        await bitable.base.registerBaseEvent(WidgetBaseEvent.SelectionChange)
        registered = true
      } catch {
        /* 非宿主环境 */
      }
      unsubSelection = bitable.base.onSelectionChange((e) => {
        void applyHostSelection(e.data)
      })
      await refreshFromHost()
    }

    void setup()
    const retryA = window.setTimeout(() => {
      void refreshFromHost()
    }, 800)
    const retryB = window.setTimeout(() => {
      void refreshFromHost()
    }, 2800)

    return () => {
      window.clearTimeout(retryA)
      window.clearTimeout(retryB)
      mounted.current = false
      unsubSelection?.()
      if (registered) {
        void bitable.base
          .unregisterBaseEvent(WidgetBaseEvent.SelectionChange)
          .catch(() => {})
      }
    }
  }, [applyHostSelection, refreshFromHost])

  const linkFieldOptions = traceFields.map((f) => ({
    value: f.id,
    label: `${f.name}（${traceFieldTypeLabel(f.type)}）`,
  }))

  const scalarFieldOptions = useMemo(
    () =>
      traceFields
        .filter((f) => f.id !== linkFieldId)
        .map((f) => ({
          value: f.id,
          label: `${f.name}（${traceFieldTypeLabel(f.type)}）`,
        })),
    [traceFields, linkFieldId],
  )

  const traceFieldType =
    traceFields.find((f) => f.id === linkFieldId)?.type ?? null

  return {
    hostError,
    tableContextHint,
    selection,
    activeTableId,
    setActiveTableId: setActiveTableIdFromUser,
    baseTables,
    recordTitle,
    linkFieldId,
    setLinkFieldId,
    linkFieldOptions,
    scalarFieldOptions,
    loading,
    primaryFieldId,
    traceFieldType,
  }
}
