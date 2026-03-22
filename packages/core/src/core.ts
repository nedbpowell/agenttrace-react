export type AgentStatus = 'idle' | 'running' | 'waiting' | 'complete' | 'error'

export type AgentNodeType = 'agent' | 'tool' | 'approval'

export interface AgentRun {
  id: string
  status: AgentStatus
  startedAt: string | null
  completedAt: string | null
  nodes: AgentNode[]
}

export interface AgentNode {
  id: string
  parentId: string | null
  type: AgentNodeType
  name: string
  status: AgentStatus
  startedAt: string | null
  completedAt: string | null
  input: unknown
  output: unknown
  error: string | null
  children: AgentNode[]
}

export type RunStartedEvent = {
  type: 'RunStarted'
  runId: string
  startedAt: string
}

export type NodeStartedEvent = {
  type: 'NodeStarted'
  node: {
    id: string
    parentId: string | null
    type: AgentNodeType
    name: string
    startedAt: string
    input?: unknown
  }
}

export type NodeCompletedEvent = {
  type: 'NodeCompleted'
  nodeId: string
  completedAt: string
  output?: unknown
  parentId?: string | null
  nodeType?: AgentNodeType
  name?: string
}

export type NodeFailedEvent = {
  type: 'NodeFailed'
  nodeId: string
  completedAt: string
  error: string
  parentId?: string | null
  nodeType?: AgentNodeType
  name?: string
}

export type ApprovalRequestedEvent = {
  type: 'ApprovalRequested'
  nodeId: string
  requestedAt: string
  input?: unknown
  parentId?: string | null
  name?: string
}

export type ApprovalResolvedEvent = {
  type: 'ApprovalResolved'
  nodeId: string
  completedAt: string
  output?: unknown
  parentId?: string | null
  name?: string
}

export type TraceEvent =
  | RunStartedEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | NodeFailedEvent
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent

export function flattenAgentNodes(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((node) => [node, ...flattenAgentNodes(node.children)])
}

export function deriveRunStatus(
  nodes: AgentNode[],
  fallback: AgentStatus
): AgentStatus {
  const allNodes = flattenAgentNodes(nodes)

  if (allNodes.some((node) => node.status === 'error')) {
    return 'error'
  }

  if (allNodes.some((node) => node.status === 'waiting')) {
    return 'waiting'
  }

  if (allNodes.some((node) => node.status === 'running')) {
    return 'running'
  }

  if (allNodes.length > 0 && allNodes.every((node) => node.status === 'complete')) {
    return 'complete'
  }

  return fallback
}

type FlatAgentNode = Omit<AgentNode, 'children'>

const DEFAULT_NODE_TYPE: AgentNodeType = 'tool'

function createNode(
  id: string,
  overrides: Partial<FlatAgentNode> = {}
): FlatAgentNode {
  return {
    id,
    parentId: null,
    type: DEFAULT_NODE_TYPE,
    name: id,
    status: 'idle',
    startedAt: null,
    completedAt: null,
    input: null,
    output: null,
    error: null,
    ...overrides
  }
}

function flattenNodes(
  nodes: AgentNode[],
  map = new Map<string, FlatAgentNode>(),
  order: string[] = []
): { map: Map<string, FlatAgentNode>; order: string[] } {
  for (const node of nodes) {
    if (!map.has(node.id)) {
      order.push(node.id)
    }

    map.set(node.id, {
      id: node.id,
      parentId: node.parentId,
      type: node.type,
      name: node.name,
      status: node.status,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
      input: node.input,
      output: node.output,
      error: node.error
    })

    flattenNodes(node.children, map, order)
  }

  return { map, order }
}

function rebuildNodes(map: Map<string, FlatAgentNode>, order: string[]): AgentNode[] {
  const byId = new Map<string, AgentNode>()

  for (const id of order) {
    const node = map.get(id)

    if (node) {
      byId.set(id, { ...node, children: [] })
    }
  }

  const roots: AgentNode[] = []

  for (const id of order) {
    const node = byId.get(id)

    if (!node) {
      continue
    }

    if (node.parentId && node.parentId !== node.id) {
      const parent = byId.get(node.parentId)

      if (parent) {
        parent.children.push(node)
        continue
      }
    }

    roots.push(node)
  }

  return roots
}

function withNode(
  nodes: AgentNode[],
  nodeId: string,
  updater: (node: FlatAgentNode | undefined) => FlatAgentNode
): AgentNode[] {
  const { map, order } = flattenNodes(nodes)
  const existing = map.get(nodeId)
  const nextNode = updater(existing)
  const isNewNode = !existing

  if (!existing || existing !== nextNode) {
    map.set(nodeId, nextNode)
  }

  if (isNewNode) {
    order.push(nodeId)
  }

  return rebuildNodes(map, order)
}

export function applyEvent(nodes: AgentNode[], event: TraceEvent): AgentNode[] {
  switch (event.type) {
    case 'RunStarted':
      return nodes

    case 'NodeStarted':
      return withNode(nodes, event.node.id, (existing) =>
        createNode(event.node.id, {
          ...existing,
          parentId: event.node.parentId,
          type: event.node.type,
          name: event.node.name,
          startedAt: event.node.startedAt,
          input: event.node.input ?? existing?.input ?? null,
          status:
            existing?.status === 'idle' || existing?.status == null
              ? 'running'
              : existing.status
        })
      )

    case 'NodeCompleted':
      return withNode(nodes, event.nodeId, (existing) =>
        createNode(event.nodeId, {
          ...existing,
          parentId: event.parentId ?? existing?.parentId ?? null,
          type: event.nodeType ?? existing?.type ?? DEFAULT_NODE_TYPE,
          name: event.name ?? existing?.name ?? event.nodeId,
          status: 'complete',
          completedAt: event.completedAt,
          output: event.output ?? existing?.output ?? null,
          error: null
        })
      )

    case 'NodeFailed':
      return withNode(nodes, event.nodeId, (existing) =>
        createNode(event.nodeId, {
          ...existing,
          parentId: event.parentId ?? existing?.parentId ?? null,
          type: event.nodeType ?? existing?.type ?? DEFAULT_NODE_TYPE,
          name: event.name ?? existing?.name ?? event.nodeId,
          status: 'error',
          completedAt: event.completedAt,
          error: event.error
        })
      )

    case 'ApprovalRequested':
      return withNode(nodes, event.nodeId, (existing) =>
        createNode(event.nodeId, {
          ...existing,
          parentId: event.parentId ?? existing?.parentId ?? null,
          type: 'approval',
          name: event.name ?? existing?.name ?? event.nodeId,
          startedAt: existing?.startedAt ?? event.requestedAt,
          input: event.input ?? existing?.input ?? null,
          status: 'waiting'
        })
      )

    case 'ApprovalResolved':
      return withNode(nodes, event.nodeId, (existing) =>
        createNode(event.nodeId, {
          ...existing,
          parentId: event.parentId ?? existing?.parentId ?? null,
          type: 'approval',
          name: event.name ?? existing?.name ?? event.nodeId,
          status: 'complete',
          completedAt: event.completedAt,
          output: event.output ?? existing?.output ?? null,
          error: null
        })
      )
  }
}
