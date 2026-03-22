// @vitest-environment jsdom

import { useRef } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  langGraphEventToTraceEvent,
  useLangGraphTrace,
  type LangGraphStreamEvent
} from './index'

afterEach(() => {
  cleanup()
})

function createStream(events: LangGraphStreamEvent[]): AsyncIterable<LangGraphStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        await Promise.resolve()
        yield event
      }
    }
  }
}

describe('langGraphEventToTraceEvent', () => {
  it('maps a node update chunk to NodeCompleted', () => {
    expect(
      langGraphEventToTraceEvent({
        runId: 'run-1',
        timestamp: '2026-03-22T10:30:00.000Z',
        planner: {
          messages: ['done']
        }
      })
    ).toEqual({
      type: 'NodeCompleted',
      nodeId: 'planner',
      nodeType: 'agent',
      name: 'planner',
      parentId: null,
      completedAt: '2026-03-22T10:30:00.000Z',
      output: {
        messages: ['done']
      }
    })
  })

  it('supports explicit phase metadata for started and nested nodes', () => {
    expect(
      langGraphEventToTraceEvent({
        timestamp: '2026-03-22T10:30:00.000Z',
        search_web: {
          phase: 'start',
          nodeId: 'tool:search-1',
          parentId: 'step:search',
          nodeType: 'tool',
          name: 'Search web',
          input: { query: 'refund eligibility' }
        }
      })
    ).toEqual({
      type: 'NodeStarted',
      node: {
        id: 'tool:search-1',
        parentId: 'step:search',
        type: 'tool',
        name: 'Search web',
        startedAt: '2026-03-22T10:30:00.000Z',
        input: { query: 'refund eligibility' }
      }
    })
  })

  it('maps interrupt chunks to ApprovalRequested', () => {
    expect(
      langGraphEventToTraceEvent({
        timestamp: '2026-03-22T10:31:00.000Z',
        __interrupt__: [
          {
            ns: ['human_review'],
            value: { question: 'Approve refund?' }
          }
        ]
      })
    ).toEqual({
      type: 'ApprovalRequested',
      nodeId: 'approval:human_review',
      parentId: null,
      name: 'human_review',
      requestedAt: '2026-03-22T10:31:00.000Z',
      input: { question: 'Approve refund?' }
    })
  })

  it('maps error payloads to NodeFailed', () => {
    expect(
      langGraphEventToTraceEvent({
        timestamp: '2026-03-22T10:32:00.000Z',
        tool_node: {
          error: 'lookup failed'
        }
      })
    ).toEqual({
      type: 'NodeFailed',
      nodeId: 'tool_node',
      nodeType: 'tool',
      name: 'tool_node',
      parentId: null,
      completedAt: '2026-03-22T10:32:00.000Z',
      error: 'lookup failed'
    })
  })

  it('returns null when the event has no usable updates', () => {
    expect(
      langGraphEventToTraceEvent({
        runId: 'run-1',
        timestamp: '2026-03-22T10:33:00.000Z'
      })
    ).toBeNull()
  })
})

describe('useLangGraphTrace', () => {
  it('consumes the async stream into a live AgentRun', async () => {
    function Harness() {
      const streamRef = useRef(
        createStream([
          {
            runId: 'run-7',
            timestamp: '2026-03-22T10:30:01.000Z',
            planner: {
              messages: ['thinking']
            }
          },
          {
            runId: 'run-7',
            timestamp: '2026-03-22T10:30:02.000Z',
            __interrupt__: [
              {
                ns: ['approval_gate'],
                value: { question: 'Approve escalation?' }
              }
            ]
          }
        ])
      )
      const run = useLangGraphTrace(streamRef.current)

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

    await waitFor(() => {
      expect(screen.getByText('run-7')).toBeTruthy()
      expect(screen.getByText('waiting')).toBeTruthy()
      expect(screen.getByText('2')).toBeTruthy()
      expect(
        screen.getByText('planner:complete|approval:approval_gate:waiting')
      ).toBeTruthy()
    })
  })
})
