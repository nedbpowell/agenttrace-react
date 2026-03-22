// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  aiSdkMessagesToAgentRun,
  aiSdkMessageToTraceEvents,
  useAiSdkTrace,
  type AiSdkUIMessage
} from './index'

describe('aiSdkMessageToTraceEvents', () => {
  it('maps assistant text content into synthesis and completed agent nodes', () => {
    const events = aiSdkMessageToTraceEvents({
      id: 'm1',
      role: 'assistant',
      createdAt: '2026-03-22T12:00:00.000Z',
      parts: [
        {
          type: 'reasoning',
          text: 'Thinking through the plan.'
        },
        {
          type: 'text',
          text: 'Here is the final answer.'
        }
      ]
    })

    expect(events).toEqual([
      {
        type: 'NodeStarted',
        node: {
          id: 'message:m1',
          parentId: null,
          type: 'agent',
          name: 'Assistant message m1',
          startedAt: '2026-03-22T12:00:00.000Z',
          input: null
        }
      },
      {
        type: 'NodeCompleted',
        nodeId: 'message:m1:response',
        parentId: 'message:m1',
        nodeType: 'agent',
        name: 'Synthesis',
        completedAt: '2026-03-22T12:00:00.000Z',
        output: {
          text: 'Thinking through the plan.\n\nHere is the final answer.'
        }
      },
      {
        type: 'NodeCompleted',
        nodeId: 'message:m1',
        parentId: null,
        nodeType: 'agent',
        name: 'Assistant message m1',
        completedAt: '2026-03-22T12:00:00.000Z',
        output: {
          text: 'Thinking through the plan.\n\nHere is the final answer.'
        }
      }
    ])
  })

  it('maps tool parts and approval parts into trace events', () => {
    const events = aiSdkMessageToTraceEvents({
      id: 'm2',
      role: 'assistant',
      createdAt: '2026-03-22T12:00:01.000Z',
      parts: [
        {
          type: 'tool-webSearch',
          toolCallId: 'call_123',
          state: 'output-available',
          input: { query: 'refund policy' },
          output: { resultCount: 3 }
        },
        {
          type: 'data-approval',
          status: 'waiting',
          data: {
            approvalId: 'approve_1',
            name: 'Human approval',
            input: { amount: 200 }
          }
        }
      ]
    })

    expect(events).toContainEqual({
      type: 'NodeCompleted',
      nodeId: 'tool:call_123',
      parentId: 'message:m2',
      nodeType: 'tool',
      name: 'webSearch',
      completedAt: '2026-03-22T12:00:01.000Z',
      output: { resultCount: 3 }
    })

    expect(events).toContainEqual({
      type: 'ApprovalRequested',
      nodeId: 'approval:approve_1',
      parentId: 'message:m2',
      name: 'Human approval',
      requestedAt: '2026-03-22T12:00:01.000Z',
      input: { amount: 200 }
    })
  })
})

describe('aiSdkMessagesToAgentRun', () => {
  it('derives a complete run from assistant messages and tool output', () => {
    const run = aiSdkMessagesToAgentRun([
      {
        id: 'assistant-1',
        role: 'assistant',
        createdAt: '2026-03-22T12:00:00.000Z',
        metadata: {
          runId: 'run-ai-1'
        },
        parts: [
          {
            type: 'tool-webSearch',
            toolCallId: 'tool-1',
            state: 'output-available',
            output: { answer: 'ok' }
          },
          {
            type: 'text',
            text: 'Drafted the reply.'
          }
        ]
      }
    ])

    expect(run.id).toBe('run-ai-1')
    expect(run.status).toBe('complete')
    expect(run.nodes[0]?.id).toBe('message:assistant-1')
    expect(run.nodes[0]?.children.map((child) => child.id).sort()).toEqual([
      'message:assistant-1:response',
      'tool:tool-1'
    ])
  })
})

describe('useAiSdkTrace', () => {
  it('returns a live AgentRun derived from AI SDK messages', () => {
    function Harness({ messages }: { messages: AiSdkUIMessage[] }) {
      const run = useAiSdkTrace(messages)

      return (
        <div>
          <span>{run.status}</span>
          <span>{String(run.nodes.length)}</span>
        </div>
      )
    }

    render(
      <Harness
        messages={[
          {
            id: 'assistant-2',
            role: 'assistant',
            createdAt: '2026-03-22T12:00:02.000Z',
            parts: [
              {
                type: 'data-approval',
                status: 'waiting',
                data: {
                  approvalId: 'approval-2'
                }
              }
            ]
          }
        ]}
      />
    )

    expect(screen.getByText('waiting')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })
})
