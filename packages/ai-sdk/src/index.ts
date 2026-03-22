import { useMemo } from 'react'
import {
  applyEvent,
  deriveRunStatus,
  flattenAgentNodes,
  type AgentRun,
  type TraceEvent
} from 'agenttrace-react'

export interface AiSdkTextPart {
  type: 'text'
  text: string
}

export interface AiSdkReasoningPart {
  type: 'reasoning'
  text: string
}

export interface AiSdkSourcePart {
  type: 'source-url' | 'source-document'
  url?: string
  title?: string
}

export interface AiSdkDynamicToolPart {
  type: `tool-${string}`
  toolCallId: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
    | 'approval-pending'
    | 'approval-required'
    | 'approval-responded'
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: {
    id?: string
    approved?: boolean
  }
}

export interface AiSdkDynamicDataPart {
  type: `data-${string}`
  data?: unknown
  status?: string
}

export type AiSdkUIMessagePart =
  | AiSdkTextPart
  | AiSdkReasoningPart
  | AiSdkSourcePart
  | AiSdkDynamicToolPart
  | AiSdkDynamicDataPart
  | {
      type: string
      [key: string]: unknown
    }

export interface AiSdkUIMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  parts?: AiSdkUIMessagePart[]
  createdAt?: Date | string
  metadata?: Record<string, unknown>
}

function normalizeTimestamp(value: Date | string | undefined, fallbackIndex: number): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    return value
  }

  return new Date(Date.now() + fallbackIndex).toISOString()
}

function extractRunId(messages: AiSdkUIMessage[]): string {
  for (const message of messages) {
    const candidate = message.metadata?.runId

    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return 'ai-sdk-run'
}

function messageNodeId(message: AiSdkUIMessage): string {
  return `message:${message.id}`
}

function responseNodeId(message: AiSdkUIMessage): string {
  return `${messageNodeId(message)}:response`
}

function toolNameFromPartType(type: string): string {
  return type.replace(/^tool-/, '')
}

function toolNodeId(part: AiSdkDynamicToolPart): string {
  return `tool:${part.toolCallId}`
}

function approvalNodeId(source: string): string {
  return `approval:${source}`
}

function isToolPart(part: AiSdkUIMessagePart): part is AiSdkDynamicToolPart {
  return typeof part.type === 'string' && part.type.startsWith('tool-')
}

function isDataPart(part: AiSdkUIMessagePart): part is AiSdkDynamicDataPart {
  return typeof part.type === 'string' && part.type.startsWith('data-')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function maybeApprovalTraceEvent(
  part: AiSdkDynamicToolPart | AiSdkDynamicDataPart,
  message: AiSdkUIMessage,
  timestamp: string
): TraceEvent | null {
  const type = part.type.toLowerCase()
  const data = isDataPart(part) ? part.data : part.approval ?? part.output ?? part.input
  const status = isDataPart(part) ? part.status?.toLowerCase() : part.state

  const looksLikeApproval =
    type.includes('approval') ||
    type.includes('hitl') ||
    status === 'approval-pending' ||
    status === 'approval-required' ||
    status === 'approval-responded'

  if (!looksLikeApproval) {
    return null
  }

  const candidateId =
    isRecord(data) && typeof data.id === 'string'
      ? data.id
      : isRecord(data) && typeof data.approvalId === 'string'
        ? data.approvalId
        : `${message.id}:${part.type}`

  const name =
    isRecord(data) && typeof data.name === 'string'
      ? data.name
      : type.includes('approval')
        ? 'Human approval'
        : part.type

  const input =
    isRecord(data) && 'input' in data
      ? data.input
      : isDataPart(part)
        ? data
        : part.input ?? data

  const output =
    isRecord(data) && 'output' in data
      ? data.output
      : isDataPart(part)
        ? data
        : part.output ?? data

  if (status === 'approval-pending' || status === 'approval-required' || status === 'waiting') {
    return {
      type: 'ApprovalRequested',
      nodeId: approvalNodeId(candidateId),
      parentId: messageNodeId(message),
      name,
      requestedAt: timestamp,
      input
    }
  }

  if (status === 'approval-responded' || status === 'resolved' || status === 'approved') {
    return {
      type: 'ApprovalResolved',
      nodeId: approvalNodeId(candidateId),
      parentId: messageNodeId(message),
      name,
      completedAt: timestamp,
      output
    }
  }

  return null
}

export function aiSdkMessageToTraceEvents(message: AiSdkUIMessage): TraceEvent[] {
  if (message.role !== 'assistant') {
    return []
  }

  const timestamp = normalizeTimestamp(message.createdAt, 0)
  const events: TraceEvent[] = [
    {
      type: 'NodeStarted',
      node: {
        id: messageNodeId(message),
        parentId: null,
        type: 'agent',
        name: `Assistant message ${message.id}`,
        startedAt: timestamp,
        input: null
      }
    }
  ]

  const textContent = (message.parts ?? [])
    .filter(
      (part): part is AiSdkTextPart | AiSdkReasoningPart =>
        part.type === 'text' || part.type === 'reasoning'
    )
    .map((part) => part.text)
    .join('\n\n')

  if (textContent.length > 0) {
    events.push({
      type: 'NodeCompleted',
      nodeId: responseNodeId(message),
      parentId: messageNodeId(message),
      nodeType: 'agent',
      name: 'Synthesis',
      completedAt: timestamp,
      output: {
        text: textContent
      }
    })
  }

  for (const part of message.parts ?? []) {
    if (isToolPart(part)) {
      const approvalEvent = maybeApprovalTraceEvent(part, message, timestamp)

      if (approvalEvent) {
        events.push(approvalEvent)
        continue
      }

      const toolName = toolNameFromPartType(part.type)

      if (part.state === 'input-streaming' || part.state === 'input-available') {
        events.push({
          type: 'NodeStarted',
          node: {
            id: toolNodeId(part),
            parentId: messageNodeId(message),
            type: 'tool',
            name: toolName,
            startedAt: timestamp,
            input: part.input
          }
        })
        continue
      }

      if (part.state === 'output-available') {
        events.push({
          type: 'NodeCompleted',
          nodeId: toolNodeId(part),
          parentId: messageNodeId(message),
          nodeType: 'tool',
          name: toolName,
          completedAt: timestamp,
          output: part.output
        })
        continue
      }

      if (part.state === 'output-error') {
        events.push({
          type: 'NodeFailed',
          nodeId: toolNodeId(part),
          parentId: messageNodeId(message),
          nodeType: 'tool',
          name: toolName,
          completedAt: timestamp,
          error: part.errorText ?? 'Tool execution failed'
        })
      }

      continue
    }

    if (isDataPart(part)) {
      const approvalEvent = maybeApprovalTraceEvent(part, message, timestamp)

      if (approvalEvent) {
        events.push(approvalEvent)
      }
    }
  }

  const hasActiveChildren = events.some(
    (event) =>
      event.type === 'ApprovalRequested' ||
      (event.type === 'NodeStarted' && event.node.parentId === messageNodeId(message))
  )
  const hasFailedChildren = events.some(
    (event) => event.type === 'NodeFailed' && event.parentId === messageNodeId(message)
  )

  if (hasFailedChildren) {
    events.push({
      type: 'NodeFailed',
      nodeId: messageNodeId(message),
      parentId: null,
      nodeType: 'agent',
      name: `Assistant message ${message.id}`,
      completedAt: timestamp,
      error: 'Assistant response contains a failed tool call'
    })
  } else if (!hasActiveChildren) {
    events.push({
      type: 'NodeCompleted',
      nodeId: messageNodeId(message),
      parentId: null,
      nodeType: 'agent',
      name: `Assistant message ${message.id}`,
      completedAt: timestamp,
      output: textContent.length > 0 ? { text: textContent } : null
    })
  }

  return events
}

export function aiSdkMessagesToAgentRun(messages: AiSdkUIMessage[]): AgentRun {
  const runId = extractRunId(messages)
  let nodes: AgentRun['nodes'] = []
  let startedAt: string | null = null

  messages.forEach((message, index) => {
    const timestamp = normalizeTimestamp(message.createdAt, index)

    if (startedAt === null) {
      startedAt = timestamp
    }

    for (const event of aiSdkMessageToTraceEvents({
      ...message,
      createdAt: timestamp
    })) {
      nodes = applyEvent(nodes, event)
    }
  })

  const status = deriveRunStatus(nodes, messages.length > 0 ? 'running' : 'idle')
  const completedCandidates = flattenAgentNodes(nodes)
    .map((node) => node.completedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return {
    id: runId,
    status,
    startedAt,
    completedAt:
      status === 'complete' || status === 'error'
        ? completedCandidates.at(-1) ?? null
        : null,
    nodes
  }
}

export function useAiSdkTrace(messages: AiSdkUIMessage[]): AgentRun {
  return useMemo(() => aiSdkMessagesToAgentRun(messages), [messages])
}
