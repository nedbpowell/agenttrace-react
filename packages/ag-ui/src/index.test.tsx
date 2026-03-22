// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agUiToTraceEvent,
  useAgUiTrace,
  type AgUiEvent
} from './index'

class MockEventSource {
  static instances: MockEventSource[] = []

  url: string
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>()
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener as (event: MessageEvent<string>) => void)
    this.listeners.set(type, listeners)
  }

  close() {
    this.closed = true
  }

  emit(type: string, payload: AgUiEvent) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }

  fail() {
    this.onerror?.()
  }
}

beforeEach(() => {
  MockEventSource.instances = []
  vi.stubGlobal('EventSource', MockEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('agUiToTraceEvent', () => {
  it('maps RUN_STARTED to RunStarted', () => {
    expect(
      agUiToTraceEvent({
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 1711100000000
      })
    ).toEqual({
      type: 'RunStarted',
      runId: 'run-1',
      startedAt: new Date(1711100000000).toISOString()
    })
  })

  it('maps STEP and TOOL events to node lifecycle events', () => {
    expect(
      agUiToTraceEvent({
        type: 'STEP_STARTED',
        stepName: 'planner',
        timestamp: 1711100000000
      })
    ).toEqual({
      type: 'NodeStarted',
      node: {
        id: 'step:planner',
        parentId: null,
        type: 'agent',
        name: 'planner',
        startedAt: new Date(1711100000000).toISOString(),
        input: undefined
      }
    })

    expect(
      agUiToTraceEvent({
        type: 'TOOL_CALL_END',
        toolCallId: 'tool-1',
        toolCallName: 'search',
        result: { ok: true },
        timestamp: 1711100001000
      })
    ).toEqual({
      type: 'NodeCompleted',
      nodeId: 'tool:tool-1',
      nodeType: 'tool',
      name: 'search',
      parentId: null,
      completedAt: new Date(1711100001000).toISOString(),
      output: { ok: true }
    })
  })

  it('maps approval-flavored CUSTOM events', () => {
    expect(
      agUiToTraceEvent({
        type: 'CUSTOM',
        name: 'HITL_APPROVAL_REQUESTED',
        timestamp: 1711100000000,
        value: {
          approvalId: 'refund-1',
          name: 'Refund approval',
          input: { amount: 200 }
        }
      })
    ).toEqual({
      type: 'ApprovalRequested',
      nodeId: 'approval:refund-1',
      parentId: null,
      name: 'Refund approval',
      requestedAt: new Date(1711100000000).toISOString(),
      input: { amount: 200 }
    })

    expect(
      agUiToTraceEvent({
        type: 'CUSTOM',
        name: 'HITL_APPROVAL_RESOLVED',
        timestamp: 1711100001000,
        value: {
          approvalId: 'refund-1',
          name: 'Refund approval',
          output: { decision: 'approved' }
        }
      })
    ).toEqual({
      type: 'ApprovalResolved',
      nodeId: 'approval:refund-1',
      parentId: null,
      name: 'Refund approval',
      completedAt: new Date(1711100001000).toISOString(),
      output: { decision: 'approved' }
    })
  })
})

describe('useAgUiTrace', () => {
  it('consumes AG-UI SSE events into a live AgentRun', async () => {
    function Harness() {
      const run = useAgUiTrace('/api/ag-ui')

      return (
        <div>
          <span>{run.id}</span>
          <span>{run.status}</span>
          <span>{String(run.nodes.length)}</span>
          <span>{run.nodes.map((node) => `${node.id}:${node.status}`).join('|')}</span>
        </div>
      )
    }

    render(<Harness />)

    const source = MockEventSource.instances[0]

    source.emit('RUN_STARTED', {
      type: 'RUN_STARTED',
      threadId: 'thread-1',
      runId: 'run-5',
      timestamp: 1711100000000
    })
    source.emit('STEP_STARTED', {
      type: 'STEP_STARTED',
      stepName: 'planner',
      timestamp: 1711100001000
    })
    source.emit('CUSTOM', {
      type: 'CUSTOM',
      name: 'HITL_APPROVAL_REQUESTED',
      timestamp: 1711100002000,
      value: {
        approvalId: 'approval-7',
        name: 'Refund approval',
        input: { amount: 200 }
      }
    })

    await waitFor(() => {
      expect(screen.getByText('run-5')).toBeTruthy()
      expect(screen.getByText('waiting')).toBeTruthy()
      expect(screen.getByText('2')).toBeTruthy()
      expect(
        screen.getByText('step:planner:running|approval:approval-7:waiting')
      ).toBeTruthy()
    })
  })

  it('marks the run as complete on RUN_FINISHED', async () => {
    function Harness() {
      const run = useAgUiTrace('/api/ag-ui-finished')
      return <span>{run.status}</span>
    }

    render(<Harness />)

    const source = MockEventSource.instances[0]
    source.emit('RUN_STARTED', {
      type: 'RUN_STARTED',
      threadId: 'thread-1',
      runId: 'run-6',
      timestamp: 1711100000000
    })
    source.emit('STEP_FINISHED', {
      type: 'STEP_FINISHED',
      stepName: 'planner',
      timestamp: 1711100001000
    })
    source.emit('RUN_FINISHED', {
      type: 'RUN_FINISHED',
      threadId: 'thread-1',
      runId: 'run-6',
      timestamp: 1711100002000
    })

    await waitFor(() => {
      expect(screen.getByText('complete')).toBeTruthy()
    })
  })
})
