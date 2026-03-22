import { useEffect, useState } from 'react'
import {
  applyEvent,
  deriveRunStatus,
  flattenAgentNodes,
  type AgentRun,
  type AgentStatus,
  type TraceEvent
} from 'agenttrace-react'

type AgUiEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_END'
  | 'CUSTOM'

interface AgUiBaseEvent {
  type: AgUiEventType
  timestamp?: number
  rawEvent?: unknown
}

export interface AgUiRunStartedEvent extends AgUiBaseEvent {
  type: 'RUN_STARTED'
  threadId: string
  runId: string
  parentRunId?: string
  input?: unknown
}

export interface AgUiRunFinishedEvent extends AgUiBaseEvent {
  type: 'RUN_FINISHED'
  threadId: string
  runId: string
  result?: unknown
}

export interface AgUiRunErrorEvent extends AgUiBaseEvent {
  type: 'RUN_ERROR'
  runId?: string
  threadId?: string
  message: string
  code?: string
}

export interface AgUiStepStartedEvent extends AgUiBaseEvent {
  type: 'STEP_STARTED'
  stepName: string
  input?: unknown
}

export interface AgUiStepFinishedEvent extends AgUiBaseEvent {
  type: 'STEP_FINISHED'
  stepName: string
  output?: unknown
}

export interface AgUiToolCallStartEvent extends AgUiBaseEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolCallName: string
  parentMessageId?: string
  args?: unknown
}

export interface AgUiToolCallEndEvent extends AgUiBaseEvent {
  type: 'TOOL_CALL_END'
  toolCallId: string
  toolCallName?: string
  result?: unknown
}

export interface AgUiCustomEvent extends AgUiBaseEvent {
  type: 'CUSTOM'
  name: string
  value: unknown
}

export type AgUiEvent =
  | AgUiRunStartedEvent
  | AgUiRunFinishedEvent
  | AgUiRunErrorEvent
  | AgUiStepStartedEvent
  | AgUiStepFinishedEvent
  | AgUiToolCallStartEvent
  | AgUiToolCallEndEvent
  | AgUiCustomEvent

const SSE_EVENT_NAMES = [
  'RUN_STARTED',
  'RUN_FINISHED',
  'RUN_ERROR',
  'STEP_STARTED',
  'STEP_FINISHED',
  'TOOL_CALL_START',
  'TOOL_CALL_END',
  'CUSTOM'
] as const

function toIsoTimestamp(timestamp?: number): string {
  return new Date(timestamp ?? Date.now()).toISOString()
}

function stepNodeId(stepName: string): string {
  return `step:${stepName}`
}

function toolNodeId(toolCallId: string): string {
  return `tool:${toolCallId}`
}

function approvalNodeId(source: string): string {
  return `approval:${source}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getCustomName(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.name === 'string') {
    return value.name
  }

  return fallback
}

function getCustomNodeId(value: unknown, fallback: string): string {
  if (isRecord(value)) {
    const candidate = value.approvalId ?? value.nodeId ?? value.id

    if (typeof candidate === 'string') {
      return approvalNodeId(candidate)
    }
  }

  return approvalNodeId(fallback)
}

function getCustomInput(value: unknown): unknown {
  if (isRecord(value) && 'input' in value) {
    return value.input
  }

  return value
}

function getCustomOutput(value: unknown): unknown {
  if (isRecord(value) && 'output' in value) {
    return value.output
  }

  return value
}

function getCustomDecision(value: unknown): string | null {
  if (!isRecord(value)) {
    return null
  }

  const candidate = value.decision ?? value.status ?? value.result

  return typeof candidate === 'string' ? candidate : null
}

function inferCustomEventKind(
  event: AgUiCustomEvent
): 'requested' | 'resolved' | null {
  const name = event.name.toLowerCase()
  const value = isRecord(event.value) ? event.value : null
  const status = typeof value?.status === 'string' ? value.status.toLowerCase() : null
  const decision = getCustomDecision(event.value)?.toLowerCase() ?? null

  if (
    name.includes('approval_requested') ||
    name.includes('hitl_requested') ||
    name.includes('approval_request') ||
    status === 'waiting' ||
    status === 'pending'
  ) {
    return 'requested'
  }

  if (
    name.includes('approval_resolved') ||
    name.includes('approval_approved') ||
    name.includes('approval_rejected') ||
    name.includes('hitl_resolved') ||
    decision !== null
  ) {
    return 'resolved'
  }

  return null
}

export function agUiToTraceEvent(event: AgUiEvent): TraceEvent | null {
  switch (event.type) {
    case 'RUN_STARTED':
      return {
        type: 'RunStarted',
        runId: event.runId,
        startedAt: toIsoTimestamp(event.timestamp)
      }

    case 'RUN_FINISHED':
      // TraceEvent has no run-finished variant, so completion is applied by the
      // SSE hook after this event is observed.
      return null

    case 'RUN_ERROR':
      return {
        type: 'NodeFailed',
        nodeId: approvalNodeId(`run-error:${event.runId ?? 'unknown'}`),
        nodeType: 'agent',
        name: 'Agent run',
        parentId: null,
        completedAt: toIsoTimestamp(event.timestamp),
        error: event.message
      }

    case 'STEP_STARTED':
      return {
        type: 'NodeStarted',
        node: {
          id: stepNodeId(event.stepName),
          parentId: null,
          type: 'agent',
          name: event.stepName,
          startedAt: toIsoTimestamp(event.timestamp),
          input: event.input
        }
      }

    case 'STEP_FINISHED':
      return {
        type: 'NodeCompleted',
        nodeId: stepNodeId(event.stepName),
        nodeType: 'agent',
        name: event.stepName,
        parentId: null,
        completedAt: toIsoTimestamp(event.timestamp),
        output: event.output
      }

    case 'TOOL_CALL_START':
      return {
        type: 'NodeStarted',
        node: {
          id: toolNodeId(event.toolCallId),
          parentId: null,
          type: 'tool',
          name: event.toolCallName,
          startedAt: toIsoTimestamp(event.timestamp),
          input: event.args ?? null
        }
      }

    case 'TOOL_CALL_END':
      return {
        type: 'NodeCompleted',
        nodeId: toolNodeId(event.toolCallId),
        nodeType: 'tool',
        name: event.toolCallName ?? event.toolCallId,
        parentId: null,
        completedAt: toIsoTimestamp(event.timestamp),
        output: event.result
      }

    case 'CUSTOM': {
      const customKind = inferCustomEventKind(event)

      if (customKind === 'requested') {
        return {
          type: 'ApprovalRequested',
          nodeId: getCustomNodeId(event.value, event.name),
          parentId: null,
          name: getCustomName(event.value, event.name),
          requestedAt: toIsoTimestamp(event.timestamp),
          input: getCustomInput(event.value)
        }
      }

      if (customKind === 'resolved') {
        return {
          type: 'ApprovalResolved',
          nodeId: getCustomNodeId(event.value, event.name),
          parentId: null,
          name: getCustomName(event.value, event.name),
          completedAt: toIsoTimestamp(event.timestamp),
          output: getCustomOutput(event.value)
        }
      }

      return null
    }
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
  const existingIds = flattenNodeIds(run)
  const nextEvents: TraceEvent[] = []

  if (
    (event.type === 'NodeCompleted' ||
      event.type === 'NodeFailed' ||
      event.type === 'ApprovalRequested' ||
      event.type === 'ApprovalResolved') &&
    !existingIds.has(event.nodeId)
  ) {
    nextEvents.push({
      type: 'NodeStarted',
      node: {
        id: event.nodeId,
        parentId: event.parentId ?? null,
        type:
          event.type === 'ApprovalRequested' || event.type === 'ApprovalResolved'
            ? 'approval'
            : event.nodeType ?? 'agent',
        name: event.name ?? event.nodeId,
        startedAt:
          event.type === 'ApprovalRequested'
            ? event.requestedAt
            : event.type === 'ApprovalResolved'
              ? event.completedAt
              : event.completedAt,
        input: event.type === 'ApprovalRequested' ? event.input : undefined
      }
    })
  }

  nextEvents.push(event)

  let nodes = run.nodes

  for (const nextEvent of nextEvents) {
    nodes = applyEvent(nodes, nextEvent)
  }

  return {
    ...run,
    status: deriveRunStatus(nodes, run.status),
    nodes
  }
}

function createInitialRun(runId?: string): AgentRun {
  return {
    id: runId ?? 'ag-ui-run',
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

function parseAgUiEvent(data: string): AgUiEvent | null {
  try {
    return JSON.parse(data) as AgUiEvent
  } catch {
    return null
  }
}

function getEventRunId(event: AgUiEvent): string | null {
  switch (event.type) {
    case 'RUN_STARTED':
    case 'RUN_FINISHED':
      return event.runId
    case 'RUN_ERROR':
      return event.runId ?? null
    default:
      return null
  }
}

export function useAgUiTrace(agentUrl: string): AgentRun {
  const [run, setRun] = useState<AgentRun>(() => createInitialRun())

  useEffect(() => {
    const eventSource = new EventSource(agentUrl)

    const handleAgUiEvent = (event: AgUiEvent) => {
      const traceEvent = agUiToTraceEvent(event)
      const eventRunId = getEventRunId(event)

      setRun((current) => {
        const baseRun: AgentRun =
          event.type === 'RUN_STARTED'
            ? {
                ...createInitialRun(event.runId),
                id: event.runId,
                status: 'running',
                startedAt: toIsoTimestamp(event.timestamp)
              }
            : eventRunId && current.id !== eventRunId
              ? {
                  ...current,
                  id: eventRunId
                }
              : current

        if (event.type === 'RUN_FINISHED') {
          return finalizeRun(
            {
              ...baseRun,
              status: deriveRunStatus(baseRun.nodes, baseRun.status)
            },
            toIsoTimestamp(event.timestamp)
          )
        }

        if (event.type === 'RUN_ERROR') {
          const withTraceError = traceEvent
            ? applyTraceEventToRun(baseRun, traceEvent)
            : baseRun

          return {
            ...withTraceError,
            status: 'error',
            completedAt: toIsoTimestamp(event.timestamp)
          }
        }

        if (!traceEvent) {
          return baseRun
        }

        const nextRun = applyTraceEventToRun(baseRun, traceEvent)

        if (traceEvent.type === 'RunStarted') {
          return {
            ...nextRun,
            id: traceEvent.runId,
            status: 'running',
            startedAt: traceEvent.startedAt
          }
        }

        return nextRun
      })
    }

    const onMessage = (message: MessageEvent<string>) => {
      const event = parseAgUiEvent(message.data)

      if (event) {
        handleAgUiEvent(event)
      }
    }

    eventSource.addEventListener('message', onMessage as EventListener)

    for (const eventName of SSE_EVENT_NAMES) {
      eventSource.addEventListener(eventName, onMessage as EventListener)
    }

    eventSource.onerror = () => {
      setRun((current) => ({
        ...current,
        status: 'error',
        completedAt: new Date().toISOString(),
        nodes: applyEvent(current.nodes, {
          type: 'NodeFailed',
          nodeId: 'ag-ui-connection',
          nodeType: 'agent',
          name: 'AG-UI SSE connection',
          parentId: null,
          completedAt: new Date().toISOString(),
          error: 'AG-UI stream connection error'
        })
      }))
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [agentUrl])

  return run
}
