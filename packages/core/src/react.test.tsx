// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApprovalGate,
  RunStatus,
  TraceNode,
  TraceProvider,
  TraceTree,
  useTrace,
  type AgentRun
} from './index'

function createRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    status: 'running',
    startedAt: '2026-03-22T10:00:00.000Z',
    completedAt: null,
    nodes: [
      {
        id: 'root',
        parentId: null,
        type: 'agent',
        name: 'Planner',
        status: 'running',
        startedAt: '2026-03-22T10:00:00.000Z',
        completedAt: null,
        input: { task: 'help customer' },
        output: null,
        error: null,
        children: [
          {
            id: 'approval-1',
            parentId: 'root',
            type: 'approval',
            name: 'Refund approval',
            status: 'waiting',
            startedAt: '2026-03-22T10:00:10.000Z',
            completedAt: null,
            input: { amount: 200 },
            output: null,
            error: null,
            children: []
          }
        ]
      }
    ],
    ...overrides
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('headless React primitives', () => {
  it('renders an accessible tree and treeitems', () => {
    render(
      <TraceProvider run={createRun()}>
        <TraceTree>
          {({ node }) => (
            <TraceNode node={node}>
              {({ name, status, type }) => (
                <div>
                  <span>{name}</span>
                  <span>{status}</span>
                  <span>{type}</span>
                </div>
              )}
            </TraceNode>
          )}
        </TraceTree>
      </TraceProvider>
    )

    expect(screen.getByRole('tree', { name: 'Trace for run run-1' })).toBeTruthy()
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
    expect(screen.getByText('Planner')).toBeTruthy()
    expect(screen.getByText('Refund approval')).toBeTruthy()
  })

  it('ApprovalGate only renders for waiting nodes and exposes callbacks', () => {
    const onApprovalAction = vi.fn()

    render(
      <TraceProvider run={createRun()} onApprovalAction={onApprovalAction}>
        <TraceTree>
          {({ node }) => (
            <TraceNode node={node}>
              {({ name }) => (
                <div>
                  <span>{name}</span>
                  <ApprovalGate>
                    {({ approve, reject, context }) => (
                      <div>
                        <p>{context.description}</p>
                        <button onClick={approve}>Approve</button>
                        <button onClick={reject}>Reject</button>
                      </div>
                    )}
                  </ApprovalGate>
                </div>
              )}
            </TraceNode>
          )}
        </TraceTree>
      </TraceProvider>
    )

    expect(screen.getByRole('group', { name: 'Approval required for Refund approval' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Approval required for Planner' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(onApprovalAction).toHaveBeenNthCalledWith(1, 'approval-1', 'approve')
    expect(onApprovalAction).toHaveBeenNthCalledWith(2, 'approval-1', 'reject')
  })

  it('useTrace exposes trace state and addEvent updates the run', () => {
    function Harness() {
      const { run, addEvent } = useTrace()
      const approvalNode = run.nodes[0]?.children[0]

      return (
        <div>
          <span>{run.status}</span>
          <span>{approvalNode?.status}</span>
          <button
            onClick={() =>
              addEvent({
                type: 'NodeCompleted',
                nodeId: 'approval-1',
                completedAt: '2026-03-22T10:01:00.000Z',
                output: { decision: 'approved' }
              })
            }
          >
            Complete approval
          </button>
        </div>
      )
    }

    render(
      <TraceProvider run={createRun({ status: 'waiting' })}>
        <Harness />
      </TraceProvider>
    )

    expect(screen.getByRole('button', { name: 'Complete approval' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Complete approval' }))
    expect(screen.getByText('complete')).toBeTruthy()
  })

  it('RunStatus exposes elapsed time for active and completed runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T10:00:05.000Z'))

    const { rerender } = render(
      <TraceProvider run={createRun()}>
        <RunStatus>
          {({ status, elapsed }) => (
            <div>
              <span>{status}</span>
              <span>{elapsed}</span>
            </div>
          )}
        </RunStatus>
      </TraceProvider>
    )

    const liveRegion = screen.getByRole('status')
    expect(within(liveRegion).getByText('running')).toBeTruthy()
    expect(within(liveRegion).getByText('5000')).toBeTruthy()

    rerender(
      <TraceProvider
        run={createRun({
          status: 'complete',
          completedAt: '2026-03-22T10:00:08.000Z'
        })}
      >
        <RunStatus>
          {({ status, elapsed }) => (
            <div>
              <span>{status}</span>
              <span>{elapsed}</span>
            </div>
          )}
        </RunStatus>
      </TraceProvider>
    )

    expect(within(screen.getByRole('status')).getByText('complete')).toBeTruthy()
    expect(within(screen.getByRole('status')).getByText('8000')).toBeTruthy()
  })
})
