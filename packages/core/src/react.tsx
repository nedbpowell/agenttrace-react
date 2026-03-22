import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  applyEvent,
  deriveRunStatus,
  flattenAgentNodes,
  type AgentNode,
  type AgentRun,
  type AgentStatus,
  type TraceEvent
} from './core'

export type ApprovalDecision = 'approve' | 'reject'

export interface TraceContextValue {
  run: AgentRun
  addEvent: (event: TraceEvent) => void
  onApprovalAction?: (nodeId: string, decision: ApprovalDecision) => void
}

interface TreeNodeContextValue {
  node: AgentNode
  level: number
  childTree: ReactNode
}

export interface TraceProviderProps {
  run: AgentRun
  onApprovalAction?: (nodeId: string, decision: ApprovalDecision) => void
  children: ReactNode
}

export interface TraceTreeRenderProps {
  node: AgentNode
  level: number
}

export interface TraceTreeProps {
  children: (props: TraceTreeRenderProps) => ReactNode
  'aria-label'?: string
}

export interface TraceNodeRenderProps {
  node: AgentNode
  name: AgentNode['name']
  status: AgentNode['status']
  type: AgentNode['type']
  timestamps: {
    startedAt: AgentNode['startedAt']
    completedAt: AgentNode['completedAt']
  }
}

export interface TraceNodeProps {
  node: AgentNode
  children: (props: TraceNodeRenderProps) => ReactNode
}

export interface ApprovalGateRenderProps {
  node: AgentNode
  approve: () => void
  reject: () => void
  context: {
    description: string
    input: AgentNode['input']
  }
}

export interface ApprovalGateProps {
  children: (props: ApprovalGateRenderProps) => ReactNode
}

export interface RunStatusProps {
  children: (props: {
    status: AgentRun['status']
    elapsed: number | null
    startedAt: AgentRun['startedAt']
    completedAt: AgentRun['completedAt']
  }) => ReactNode
}

const TraceContext = createContext<TraceContextValue | null>(null)
const TreeNodeContext = createContext<TreeNodeContextValue | null>(null)

function getRunStartedAt(run: AgentRun, nodes: AgentNode[], event: TraceEvent): string | null {
  if (event.type === 'RunStarted') {
    return event.startedAt
  }

  if (run.startedAt) {
    return run.startedAt
  }

  const startedTimestamps = flattenAgentNodes(nodes)
    .map((node) => node.startedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return startedTimestamps[0] ?? null
}

function getRunCompletedAt(
  run: AgentRun,
  nodes: AgentNode[],
  status: AgentStatus,
  event: TraceEvent
): string | null {
  if (status !== 'complete' && status !== 'error') {
    return null
  }

  if (
    event.type === 'NodeCompleted' ||
    event.type === 'NodeFailed' ||
    event.type === 'ApprovalResolved'
  ) {
    return event.completedAt
  }

  if (run.completedAt) {
    return run.completedAt
  }

  const completedTimestamps = flattenAgentNodes(nodes)
    .map((node) => node.completedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return completedTimestamps.at(-1) ?? null
}

function reduceRun(run: AgentRun, event: TraceEvent): AgentRun {
  if (event.type === 'RunStarted') {
    return {
      ...run,
      id: event.runId,
      status: 'running',
      startedAt: event.startedAt,
      completedAt: null
    }
  }

  const nodes = applyEvent(run.nodes, event)
  const status = deriveRunStatus(nodes, run.status)

  return {
    ...run,
    status,
    startedAt: getRunStartedAt(run, nodes, event),
    completedAt: getRunCompletedAt(run, nodes, status, event),
    nodes
  }
}

function useTraceContext(): TraceContextValue {
  const context = useContext(TraceContext)

  if (!context) {
    throw new Error('Trace components must be used within <TraceProvider>.')
  }

  return context
}

function useTreeNodeContext(componentName: string): TreeNodeContextValue {
  const context = useContext(TreeNodeContext)

  if (!context) {
    throw new Error(`<${componentName}> must be used within <TraceTree>.`)
  }

  return context
}

export function TraceProvider({
  run,
  onApprovalAction,
  children
}: TraceProviderProps) {
  const [state, setState] = useState(run)

  useEffect(() => {
    setState(run)
  }, [run])

  const value = useMemo<TraceContextValue>(
    () => ({
      run: state,
      onApprovalAction,
      addEvent: (event) => {
        setState((current) => reduceRun(current, event))
      }
    }),
    [onApprovalAction, state]
  )

  return <TraceContext.Provider value={value}>{children}</TraceContext.Provider>
}

export function TraceTree({
  children,
  'aria-label': ariaLabel
}: TraceTreeProps) {
  const { run } = useTraceContext()

  const renderNode = (node: AgentNode, level: number): ReactNode => {
    const childTree =
      node.children.length > 0 ? (
        <div role="group">
          {node.children.map((child) => renderNode(child, level + 1))}
        </div>
      ) : null

    return (
      <TreeNodeContext.Provider
        key={node.id}
        value={{
          node,
          level,
          childTree
        }}
      >
        {children({ node, level })}
      </TreeNodeContext.Provider>
    )
  }

  return (
    <div role="tree" aria-label={ariaLabel ?? `Trace for run ${run.id}`}>
      {run.nodes.map((node) => renderNode(node, 1))}
    </div>
  )
}

export function TraceNode({ node, children }: TraceNodeProps) {
  const { node: contextNode, level, childTree } = useTreeNodeContext('TraceNode')
  const descriptionId = useId()
  const errorId = useId()
  const isCurrentNode = contextNode.id === node.id

  if (!isCurrentNode) {
    console.warn(
      '<TraceNode node={...}> received a node that does not match the current <TraceTree> render context. Rendering the contextual node instead.'
    )
  }

  const resolvedNode = isCurrentNode ? node : contextNode
  const hasChildren = resolvedNode.children.length > 0

  return (
    <div
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? true : undefined}
      aria-busy={
        resolvedNode.status === 'running' || resolvedNode.status === 'waiting'
          ? true
          : undefined
      }
      aria-describedby={resolvedNode.completedAt || resolvedNode.error ? descriptionId : undefined}
      aria-errormessage={resolvedNode.error ? errorId : undefined}
    >
      {children({
        node: resolvedNode,
        name: resolvedNode.name,
        status: resolvedNode.status,
        type: resolvedNode.type,
        timestamps: {
          startedAt: resolvedNode.startedAt,
          completedAt: resolvedNode.completedAt
        }
      })}
      {resolvedNode.completedAt ? (
        <span id={descriptionId} hidden>
          Completed at {resolvedNode.completedAt}
        </span>
      ) : null}
      {resolvedNode.error ? (
        <span id={errorId} role="alert" hidden>
          {resolvedNode.error}
        </span>
      ) : null}
      {childTree}
    </div>
  )
}

export function ApprovalGate({ children }: ApprovalGateProps) {
  const { node } = useTreeNodeContext('ApprovalGate')
  const { onApprovalAction } = useTraceContext()

  if (node.status !== 'waiting') {
    return null
  }

  const approve = () => {
    onApprovalAction?.(node.id, 'approve')
  }

  const reject = () => {
    onApprovalAction?.(node.id, 'reject')
  }

  return (
    <div role="group" aria-label={`Approval required for ${node.name}`}>
      {children({
        node,
        approve,
        reject,
        context: {
          description: `Approval required for ${node.name}`,
          input: node.input
        }
      })}
    </div>
  )
}

export function RunStatus({ children }: RunStatusProps) {
  const { run } = useTraceContext()
  const [now, setNow] = useState(() => Date.now())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const isActive =
      run.startedAt !== null &&
      (run.status === 'running' || run.status === 'waiting')

    if (!isActive) {
      setNow(Date.now())
      return
    }

    timerRef.current = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [run.startedAt, run.status])

  const elapsed =
    run.startedAt === null
      ? null
      : (run.completedAt ? Date.parse(run.completedAt) : now) - Date.parse(run.startedAt)

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {children({
        status: run.status,
        elapsed,
        startedAt: run.startedAt,
        completedAt: run.completedAt
      })}
    </div>
  )
}

export function useTrace() {
  const context = useTraceContext()

  return {
    ...context,
    nodes: context.run.nodes
  }
}
