import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Layout,
  Typography,
  Select,
  Form,
  Input,
  Divider,
  Alert,
  Spin,
} from 'antd'
import { ReactFlow, Background, Controls, MiniMap } from 'reactflow'
import type { Node, Edge, ReactFlowInstance } from 'reactflow'
import type { TraceNodeData } from '../types/trace'
import 'reactflow/dist/style.css'
import { bitable } from '@lark-base-open/js-sdk'
import { useBitableWorkspace } from '../hooks/useBitableWorkspace'
import { buildTraceGraph, TRACE_MAX_DEPTH } from '../lib/buildTraceGraph'
import { applyTargetDiagnosis } from '../lib/applyTargetDiagnosis'
import { buildNaturalConclusion } from '../lib/buildNaturalConclusion'
import type { RecordSnapshot } from '../lib/applyTargetDiagnosis'
import {
  loadDiagnosisPrefs,
  saveDiagnosisPrefs,
} from '../lib/diagnosisPrefs'

const { Header, Sider, Content } = Layout

const PLACEHOLDER_HINT: Node[] = [
  {
    id: 'hint',
    position: { x: 40, y: 100 },
    data: { label: '请选择「追踪字段」以展示向上追溯链路' },
    type: 'default',
  },
]

const PLACEHOLDER_SELECT_ROW: Node[] = [
  {
    id: 'hint-row',
    position: { x: 40, y: 100 },
    data: { label: '在多维表中选中一行后，将在此展示向上追溯链路' },
    type: 'default',
  },
]


export function DiagnosisPage() {
  const {
    hostError,
    tableContextHint,
    recordTitle,
    linkFieldOptions,
    linkFieldId,
    setLinkFieldId,
    loading,
    selection,
    activeTableId,
    setActiveTableId,
    baseTables,
    primaryFieldId,
    scalarFieldOptions,
    traceFieldType,
  } = useBitableWorkspace()

  const prefsTableId = activeTableId ?? selection?.tableId ?? null

  const flowRef = useRef<ReactFlowInstance | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [hideMiniMap, setHideMiniMap] = useState(false)

  const [traceNodes, setTraceNodes] = useState<Node<TraceNodeData>[] | null>(
    null,
  )
  const [traceEdges, setTraceEdges] = useState<Edge[]>([])
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphWarnings, setGraphWarnings] = useState<string[]>([])

  const [targetFieldId, setTargetFieldId] = useState<string | undefined>()
  const [targetValue, setTargetValue] = useState('')
  const [snapshots, setSnapshots] = useState<Map<string, RecordSnapshot>>(
    () => new Map(),
  )

  useEffect(() => {
    if (!prefsTableId) return
    const prefs = loadDiagnosisPrefs({
      baseId: selection?.baseId ?? null,
      tableId: prefsTableId,
      viewId: selection?.viewId ?? null,
    })
    /* eslint-disable react-hooks/set-state-in-effect -- 从 localStorage 恢复视图级偏好 */
    setTargetFieldId(prefs.targetFieldId)
    setTargetValue(prefs.targetValue ?? '')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selection?.baseId, prefsTableId, selection?.viewId])

  useEffect(() => {
    if (!prefsTableId) return
    saveDiagnosisPrefs(
      {
        baseId: selection?.baseId ?? null,
        tableId: prefsTableId,
        viewId: selection?.viewId ?? null,
      },
      {
        targetFieldId,
        targetValue,
      },
    )
  }, [
    selection?.baseId,
    prefsTableId,
    selection?.viewId,
    targetFieldId,
    targetValue,
  ])

  useEffect(() => {
    if (
      targetFieldId &&
      scalarFieldOptions.length > 0 &&
      !scalarFieldOptions.some((o) => o.value === targetFieldId)
    ) {
      /* eslint-disable react-hooks/set-state-in-effect -- 表结构变化后清除无效字段 */
      setTargetFieldId(undefined)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [scalarFieldOptions, targetFieldId])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      setHideMiniMap(width < 520 || height < 420)
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.12, duration: 200 })
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* 画布数据由「选中行 + 追踪字段」推导，与外部宿主状态对齐 */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (
      !activeTableId ||
      !selection?.recordId ||
      !linkFieldId ||
      !primaryFieldId ||
      loading
    ) {
      setTraceEdges([])
      setGraphWarnings([])
      setTraceNodes(null)
      setGraphLoading(false)
      return
    }

    let cancelled = false
    setGraphLoading(true)
    setGraphWarnings([])

    void (async () => {
      try {
        const table = await bitable.base.getTableById(activeTableId)
        const { nodes, edges, warnings } = await buildTraceGraph({
          table,
          startRecordId: selection.recordId!,
          linkFieldId,
          primaryFieldId,
          traceFieldType,
        })
        if (cancelled) return
        setTraceNodes(nodes)
        setTraceEdges(edges)
        setGraphWarnings(warnings)
      } catch (e) {
        if (!cancelled) {
          setTraceNodes(null)
          setTraceEdges([])
          setGraphWarnings([
            e instanceof Error ? e.message : '构建链路失败，请重试',
          ])
        }
      } finally {
        if (!cancelled) setGraphLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    activeTableId,
    selection?.recordId,
    linkFieldId,
    primaryFieldId,
    loading,
    traceFieldType,
  ])

  useEffect(() => {
    if (!traceNodes?.length || !activeTableId) {
      /* eslint-disable react-hooks/set-state-in-effect -- 无链路时清空快照 */
      setSnapshots(new Map())
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const table = await bitable.base.getTableById(activeTableId)
        const ids = traceNodes.map((n) => n.data.recordId)
        const rows = await table.getRecordsByIds(ids, false)
        if (cancelled) return
        const next = new Map<string, RecordSnapshot>()
        ids.forEach((id, i) => {
          const row = rows[i]
          next.set(id, row ?? { fields: {} })
        })
        setSnapshots(next)
      } catch {
        if (!cancelled) setSnapshots(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [traceNodes, activeTableId])

  /* eslint-disable react-hooks/preserve-manual-memoization -- 依赖与链路/快照一致即可 */
  const diagnosis = useMemo(() => {
    const defaultSummary =
      '完成目标条件配置后，将在此展示摘要；红色节点为未达标，绿色为达标。'
    if (!selection?.recordId) {
      return {
        nodes: PLACEHOLDER_SELECT_ROW,
        summary: defaultSummary,
        rootFirstBlockedTitle: null,
        rootFirstBlockedReason: null,
        nearestBlockedTitle: null,
        nearestBlockedReason: null,
        blockedCount: 0,
      }
    }
    if (!traceNodes?.length) {
      return {
        nodes: PLACEHOLDER_HINT,
        summary: defaultSummary,
        rootFirstBlockedTitle: null,
        rootFirstBlockedReason: null,
        nearestBlockedTitle: null,
        nearestBlockedReason: null,
        blockedCount: 0,
      }
    }
    return applyTargetDiagnosis({
      traceNodes,
      snapshots,
      targetFieldId,
      targetValue,
      edges: traceEdges,
      leafRecordId: selection.recordId,
      targetFieldLabel: scalarFieldOptions.find((o) => o.value === targetFieldId)
        ?.label,
    })
  }, [
    traceNodes,
    snapshots,
    targetFieldId,
    targetValue,
    traceEdges,
    selection?.recordId,
    scalarFieldOptions,
  ])
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const flowNodes: Node[] = diagnosis.nodes
  const flowEdges = useMemo(
    () => (traceNodes?.length ? traceEdges : []),
    [traceNodes, traceEdges],
  )

  const conclusionText = useMemo(
    () =>
      buildNaturalConclusion({
        recordTitle,
        recordId: selection?.recordId,
        hasTrace: Boolean(traceNodes?.length),
        linkFieldSelected: Boolean(linkFieldId),
        diagnosing: Boolean(targetFieldId && targetValue.trim()),
        targetFieldName: scalarFieldOptions.find(
          (o) => o.value === targetFieldId,
        )?.label,
        targetValueTrimmed: targetValue.trim(),
        blockedCount: diagnosis.blockedCount,
        traceNodeCount: traceNodes?.length ?? 0,
        traceEdgeCount: traceEdges.length,
        rootFirstBlockedTitle: diagnosis.rootFirstBlockedTitle,
        rootFirstBlockedReason: diagnosis.rootFirstBlockedReason,
        nearestBlockedTitle: diagnosis.nearestBlockedTitle,
        nearestBlockedReason: diagnosis.nearestBlockedReason,
      }),
    [
      recordTitle,
      selection?.recordId,
      traceNodes,
      traceEdges,
      linkFieldId,
      targetFieldId,
      targetValue,
      scalarFieldOptions,
      diagnosis,
    ],
  )

  useEffect(() => {
    if (!graphLoading && flowNodes.length) {
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.15, duration: 240 })
      })
    }
  }, [graphLoading, flowNodes, flowEdges, diagnosis])

  const headerHint =
    !activeTableId
      ? baseTables.length > 1
        ? '请先在侧栏选择要诊断的数据表（子表）'
        : '正在解析当前数据表，请稍候或刷新后重试'
      : !selection?.recordId
        ? loading
          ? '正在载入当前表字段…'
          : '已载入当前表字段，请点击表格中的一行或单元格以选定诊断起点'
        : loading
          ? '正在读取记录…'
          : `当前诊断：${recordTitle || selection.recordId}`

  const graphAlertMessage = graphWarnings.length
    ? graphWarnings.join(' ')
    : null

  return (
    <Layout className="diagnosis-shell">
      <Header className="diagnosis-header">
        <Typography.Text strong className="diagnosis-header__title">
          业务根因诊断器
        </Typography.Text>
        <Typography.Text type="secondary" className="diagnosis-header__hint" ellipsis>
          {headerHint}
        </Typography.Text>
      </Header>

      {hostError ? (
        <div className="diagnosis-alert-wrap">
          <Alert type="warning" showIcon message={hostError} />
        </div>
      ) : null}
      {tableContextHint ? (
        <div className="diagnosis-alert-wrap">
          <Alert type="info" showIcon message={tableContextHint} />
        </div>
      ) : null}

      <Layout className="diagnosis-body">
        <Sider width={320} theme="light" className="diagnosis-sider">
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            配置
          </Typography.Title>
          <Spin spinning={loading}>
            <Form layout="vertical" size="small">
              <Form.Item label="数据表（子表）">
                <Select
                  placeholder={
                    baseTables.length
                      ? '选择要诊断的子表（将加载该表全部字段）'
                      : '正在加载子表列表…'
                  }
                  showSearch
                  optionFilterProp="label"
                  value={activeTableId ?? undefined}
                  onChange={(v) => setActiveTableId(v)}
                  disabled={baseTables.length === 0}
                  options={baseTables.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              </Form.Item>
              <Form.Item label="追踪字段（任选；关联类可向上追溯）">
                <Select
                  placeholder={
                    !activeTableId
                      ? '请先选择子表'
                      : '选择用于向上追溯的字段（推荐关联/查找引用）'
                  }
                  allowClear
                  value={linkFieldId}
                  onChange={(v) => setLinkFieldId(v)}
                  disabled={!activeTableId || loading}
                  options={linkFieldOptions}
                  notFoundContent={
                    activeTableId && !loading ? '当前表无字段' : null
                  }
                />
              </Form.Item>
              <Divider style={{ margin: '12px 0' }} />
              <Form.Item label="目标字段（用于判断是否达标）">
                <Select
                  placeholder={
                    !activeTableId
                      ? '请先选择子表'
                      : '选择目标字段（可与追踪字段不同）'
                  }
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={targetFieldId}
                  onChange={(v) => setTargetFieldId(v)}
                  disabled={!activeTableId || loading}
                  options={scalarFieldOptions}
                  notFoundContent={
                    activeTableId && !loading ? '暂无可选字段' : null
                  }
                />
              </Form.Item>
              <Form.Item label="目标值">
                <Input
                  placeholder="与单元格展示文案一致，如：已完成"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  disabled={!activeTableId || loading}
                />
              </Form.Item>
            </Form>
          </Spin>
          <Divider />
          <Typography.Title level={5}>诊断结论</Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            {conclusionText}
          </Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            摘要：{diagnosis.summary}
          </Typography.Text>
        </Sider>
        <Content className="diagnosis-content">
          <Typography.Text type="secondary" className="diagnosis-canvas-hint">
            链路画布 · 上方为上游、下方为当前选中记录（最多 {TRACE_MAX_DEPTH}{' '}
            层）；配置目标后绿/红高亮
          </Typography.Text>
          {graphAlertMessage ? (
            <div style={{ padding: '0 12px 8px' }}>
              <Alert type="info" showIcon message={graphAlertMessage} />
            </div>
          ) : null}
          {activeTableId &&
          linkFieldId &&
          !selection?.recordId &&
          !graphLoading ? (
            <div style={{ padding: '0 12px 8px' }}>
              <Alert
                type="warning"
                showIcon
                message="链路尚未生成：请在左侧「多维表格」里点击某一行的行号或任意单元格，选定一条记录作为起点。"
                description="侧栏里选的是子表与字段配置；画布上的链路必须从宿主返回的「当前选中行」开始。选成功后，顶部会显示「当前诊断：…」而非仅提示点击表格。"
              />
            </div>
          ) : null}
          <div className="react-flow-wrap" ref={wrapRef}>
            <Spin spinning={graphLoading} tip="构建链路中…">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                onInit={(inst) => {
                  flowRef.current = inst
                  inst.fitView({ padding: 0.12 })
                }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                minZoom={0.15}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={16} />
                <Controls showInteractive={false} />
                {!hideMiniMap ? <MiniMap pannable zoomable /> : null}
              </ReactFlow>
            </Spin>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
