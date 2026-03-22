import { useEffect, useState } from 'react'
import {
  applyEvent,
  deriveRunStatus,
  flattenAgentNodes,
  type AgentStatus,
  type AgentNodeType,
  type AgentRun,
  type TraceEvent
} from 'agenttrace-react'

export interface LangGraphInterrupt {
  value?: unknown
  resumable?: boolean
  ns?: string[]
}

export type LangGraphNodeUpdate = Record<string, unknown>

export interface LangGraphStreamEvent {
  runId?: string
  timestamp?: string
  __interrupt__?: LangGraphInterrupt[]
  [nodeName: string]: unknown
}

const META_KEYS = new Set(['runId', 'timestamp', '__interrupt__'])

function getTimestamp(event: LangGraphStreamEvent): string {
  return event.timestamp ?? new Date().toISOString()
}

function toNodeId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function inferNodeType(name: string, update: LangGraphNodeUpdate): AgentNodeType {
  if (typeof update.nodeType === 'string') {
    if (
      update.nodeType === 'agent' ||
      update.nodeType === 'tool' ||
      update.nodeType === 'approval'
    ) {
      return update.nodeType
    }
  }

  if (
    /approval|interrupt|human/i.test(name) ||
    'interrupt' in update ||
    'approval' in update
  ) {
    return 'approval'
  }

  if (
    /tool/i.test(name) ||
    'tool' in update ||
    'toolCallId' in update ||
    'tool_calls' in update
  ) {
    return 'tool'
  }

  return 'agent'
}

function getNodeEntry(
  event: LangGraphStreamEvent
): [string, LangGraphNodeUpdate] | null {
  for (const [key, value] of Object.entries(event)) {
    if (META_KEYS.has(key)) {
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return [key, value as LangGraphNodeUpdate]
    }
  }

  return null
}

function getNodeId(name: string, update: LangGraphNodeUpdate): string {
  return typeof update.nodeId === 'string' ? update.nodeId : toNodeId(name)
}

function getNodeName(name: string, update: LangGraphNodeUpdate): string {
  return typeof update.name === 'string' ? update.name : name
}

function getParentId(update: LangGraphNodeUpdate): string | null {
  return typeof update.parentId === 'string' ? update.parentId : null
}

function getPhase(update: LangGraphNodeUpdate): string | null {
  return typeof update.phase === 'string'
    ? update.phase.toLowerCase()
    : typeof update.status === 'string'
      ? update.status.toLowerCase()
      : null
}

function getInterruptNode(event: LangGraphStreamEvent): TraceEvent | null {
  const interrupt = event.__interrupt__?.[0]

  if (!interrupt) {
    return null
  }

  const path = interrupt.ns?.join('/') ?? 'interrupt'

  return {
    type: 'ApprovalRequested',
    nodeId:
      isRecord(interrupt.value) && typeof interrupt.value.approvalId === 'string'
        ? `approval:${interrupt.value.approvalId}`
        : `approval:${path}`,
    parentId:
      isRecord(interrupt.value) && typeof interrupt.value.parentId === 'string'
        ? interrupt.value.parentId
        : null,
    name:
      isRecord(interrupt.value) && typeof interrupt.value.name === 'string'
        ? interrupt.value.name
        : path,
    requestedAt: getTimestamp(event),
    input:
      isRecord(interrupt.value) && 'input' in interrupt.value
        ? interrupt.value.input
        : interrupt.value ?? null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function langGraphEventToTraceEvent(
  event: LangGraphStreamEvent
): TraceEvent | null {
  const interruptEvent = getInterruptNode(event)

  if (interruptEvent) {
    return interruptEvent
  }

  const entry = getNodeEntry(event)

  if (!entry) {
    return null
  }

  const [nodeName, update] = entry
  const timestamp = getTimestamp(event)
  const nodeId = getNodeId(nodeName, update)
  const name = getNodeName(nodeName, update)
  const parentId = getParentId(update)
  const nodeType = inferNodeType(nodeName, update)
  const phase = getPhase(update)
  const error =
    typeof update.error === 'string'
      ? update.error
      : typeof update.__error__ === 'string'
        ? update.__error__
        : null

  if (error) {
    return {
        type: 'NodeFailed',
        nodeId,
        nodeType,
        name,
        parentId,
        completedAt: timestamp,
        error
      }
  }

  if (phase === 'start' || phase === 'running') {
    return {
      type: 'NodeStarted',
      node: {
        id: nodeId,
        parentId,
        type: nodeType,
        name,
        startedAt:
          typeof update.startedAt === 'string' ? update.startedAt : timestamp,
        input: 'input' in update ? update.input : undefined
      }
    }
  }

  if (nodeType === 'approval' && (phase === 'waiting' || phase === 'pending')) {
    return {
      type: 'ApprovalRequested',
      nodeId,
      parentId,
      name,
      requestedAt:
        typeof update.startedAt === 'string' ? update.startedAt : timestamp,
      input: 'input' in update ? update.input : null
    }
  }

  if (nodeType === 'approval' && (phase === 'resolved' || phase === 'complete')) {
    return {
      type: 'ApprovalResolved',
      nodeId,
      parentId,
      name,
      completedAt:
        typeof update.completedAt === 'string' ? update.completedAt : timestamp,
      output: 'output' in update ? update.output : update
    }
  }

  return {
    type: 'NodeCompleted',
    nodeId,
    nodeType,
    name,
    parentId,
    completedAt:
      typeof update.completedAt === 'string' ? update.completedAt : timestamp,
    output: 'output' in update ? update.output : update
  }
}

function flattenNodeIds(run: AgentRun): Set<string> {
  const ids = new Set<string>()

  for (const node of flattenAgentNodes(run.nodes)) {
    ids.add(node.id)
  }

  return ids
}

function applyTraceEventToRun(run: AgentRun, event: TraceEvent): AgentRun {
  const existingNodeIds = flattenNodeIds(run)
  const nextEvents: TraceEvent[] = []

  if (
    event.type === 'NodeCompleted' ||
    event.type === 'NodeFailed' ||
    event.type === 'ApprovalRequested'
  ) {
    const nodeId = event.nodeId

    if (!existingNodeIds.has(nodeId)) {
      nextEvents.push({
        type: 'NodeStarted',
        node: {
          id: nodeId,
          parentId: event.parentId ?? null,
          type:
            event.type === 'ApprovalRequested'
              ? 'approval'
              : event.nodeType ?? 'agent',
          name: event.name ?? nodeId,
          startedAt:
            event.type === 'ApprovalRequested'
              ? event.requestedAt
              : event.completedAt,
          input: event.type === 'ApprovalRequested' ? event.input : undefined
        }
      })
    }
  }

  nextEvents.push(event)

  let nodes = run.nodes

  for (const nextEvent of nextEvents) {
    nodes = applyEvent(nodes, nextEvent)
  }

  const status = deriveRunStatus(nodes, run.status)
  const completedAt =
    status === 'complete' || status === 'error'
      ? event.type === 'ApprovalRequested'
        ? null
        : getTimestampForTraceEvent(event)
      : null

  return {
    ...run,
    status,
    completedAt,
    nodes
  }
}

function getTimestampForTraceEvent(event: TraceEvent): string | null {
  switch (event.type) {
    case 'RunStarted':
      return event.startedAt
    case 'NodeStarted':
      return event.node.startedAt
    case 'NodeCompleted':
    case 'NodeFailed':
    case 'ApprovalResolved':
      return event.completedAt
    case 'ApprovalRequested':
      return event.requestedAt
  }
}

function createInitialRun(runId?: string): AgentRun {
  return {
    id: runId ?? 'langgraph-run',
    status: 'idle',
    startedAt: null,
    completedAt: null,
    nodes: []
  }
}

function finalizeRun(run: AgentRun, completedAt: string): AgentRun {
  let status: AgentStatus = run.status

  if (status !== 'error' && status !== 'waiting') {
    status = run.nodes.length > 0 ? 'complete' : 'idle'
  }

  return {
    ...run,
    status,
    completedAt:
      status === 'complete' || status === 'error' ? run.completedAt ?? completedAt : null
  }
}

export function useLangGraphTrace(
  stream: AsyncIterable<LangGraphStreamEvent>
): AgentRun {
  const [run, setRun] = useState<AgentRun>(() => createInitialRun())

  useEffect(() => {
    let cancelled = false
    const startedAt = new Date().toISOString()

    setRun((current) => ({
      ...createInitialRun(current.id),
      id: current.id,
      status: 'running',
      startedAt
    }))

    const consume = async () => {
      try {
        for await (const event of stream) {
          if (cancelled) {
            return
          }

          const traceEvent = langGraphEventToTraceEvent(event)

          setRun((current) => {
            const baseRun: AgentRun =
              current.startedAt === null
                ? {
                    ...current,
                    status: 'running',
                    startedAt: event.timestamp ?? startedAt
                  }
                : current

            const nextRunId = event.runId ?? baseRun.id

            if (!traceEvent) {
              return {
                ...baseRun,
                id: nextRunId
              }
            }

            return {
              ...applyTraceEventToRun(
                {
                  ...baseRun,
                  id: nextRunId
                },
                traceEvent
              ),
              id: nextRunId
            }
          })
        }

        if (!cancelled) {
          setRun((current) => finalizeRun(current, new Date().toISOString()))
        }
      } catch (error) {
        if (!cancelled) {
          const completedAt = new Date().toISOString()

          setRun((current) => ({
            ...current,
            status: 'error',
            completedAt,
            nodes: applyEvent(current.nodes, {
              type: 'NodeFailed',
              nodeId: 'langgraph-stream',
              name: 'LangGraph stream',
              nodeType: 'agent',
              parentId: null,
              completedAt,
              error: error instanceof Error ? error.message : 'Unknown stream error'
            })
          }))
        }
      }
    }

    void consume()

    return () => {
      cancelled = true
    }
  }, [stream])

  return run
}
