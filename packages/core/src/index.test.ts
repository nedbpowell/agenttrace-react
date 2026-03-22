import { describe, expect, it } from 'vitest'
import { applyEvent, type AgentNode } from './index'

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'node',
    parentId: null,
    type: 'agent',
    name: 'Node',
    status: 'idle',
    startedAt: null,
    completedAt: null,
    input: null,
    output: null,
    error: null,
    children: [],
    ...overrides
  }
}

describe('applyEvent', () => {
  it('returns the same tree for RunStarted because nodes are unchanged', () => {
    const nodes = [makeNode({ id: 'root' })]

    const nextNodes = applyEvent(nodes, {
      type: 'RunStarted',
      runId: 'run-1',
      startedAt: '2026-03-22T10:00:00.000Z'
    })

    expect(nextNodes).toBe(nodes)
  })

  it('adds a started node at the root level', () => {
    const nextNodes = applyEvent([], {
      type: 'NodeStarted',
      node: {
        id: 'root',
        parentId: null,
        type: 'agent',
        name: 'Planner',
        startedAt: '2026-03-22T10:00:00.000Z',
        input: { goal: 'Investigate billing issue' }
      }
    })

    expect(nextNodes).toEqual([
      makeNode({
        id: 'root',
        type: 'agent',
        name: 'Planner',
        status: 'running',
        startedAt: '2026-03-22T10:00:00.000Z',
        input: { goal: 'Investigate billing issue' }
      })
    ])
  })

  it('updates a deeply nested node immutably when it completes', () => {
    const grandchild = makeNode({
      id: 'grandchild',
      parentId: 'child',
      type: 'tool',
      name: 'Fetch CRM record',
      status: 'running',
      startedAt: '2026-03-22T10:01:00.000Z'
    })
    const child = makeNode({
      id: 'child',
      parentId: 'root',
      type: 'agent',
      name: 'Support agent',
      children: [grandchild]
    })
    const root = makeNode({
      id: 'root',
      type: 'agent',
      name: 'Root',
      children: [child]
    })
    const nodes = [root]

    const nextNodes = applyEvent(nodes, {
      type: 'NodeCompleted',
      nodeId: 'grandchild',
      completedAt: '2026-03-22T10:02:00.000Z',
      output: { customerId: 'cus_123' }
    })

    expect(nextNodes).not.toBe(nodes)
    expect(nextNodes[0]).not.toBe(root)
    expect(nextNodes[0]?.children[0]).not.toBe(child)
    expect(nextNodes[0]?.children[0]?.children[0]).not.toBe(grandchild)
    expect(nodes[0]?.children[0]?.children[0]?.status).toBe('running')
    expect(nextNodes[0]?.children[0]?.children[0]).toMatchObject({
      id: 'grandchild',
      status: 'complete',
      completedAt: '2026-03-22T10:02:00.000Z',
      output: { customerId: 'cus_123' }
    })
  })

  it('marks a node as failed and preserves its position in the tree', () => {
    const nodes = [
      makeNode({
        id: 'root',
        children: [
          makeNode({
            id: 'tool-1',
            parentId: 'root',
            type: 'tool',
            name: 'Lookup invoice',
            status: 'running',
            startedAt: '2026-03-22T10:01:00.000Z'
          })
        ]
      })
    ]

    const nextNodes = applyEvent(nodes, {
      type: 'NodeFailed',
      nodeId: 'tool-1',
      completedAt: '2026-03-22T10:02:00.000Z',
      error: 'Invoice service unavailable'
    })

    expect(nextNodes[0]?.children[0]).toMatchObject({
      id: 'tool-1',
      status: 'error',
      completedAt: '2026-03-22T10:02:00.000Z',
      error: 'Invoice service unavailable'
    })
  })

  it('creates a waiting approval node when approval is requested before the node exists', () => {
    const nextNodes = applyEvent([], {
      type: 'ApprovalRequested',
      nodeId: 'approval-1',
      requestedAt: '2026-03-22T10:03:00.000Z',
      parentId: 'root',
      name: 'Refund approval',
      input: { amount: 200 }
    })

    expect(nextNodes).toEqual([
      makeNode({
        id: 'approval-1',
        parentId: 'root',
        type: 'approval',
        name: 'Refund approval',
        status: 'waiting',
        startedAt: '2026-03-22T10:03:00.000Z',
        input: { amount: 200 }
      })
    ])
  })

  it('resolves an approval node to complete', () => {
    const nodes = [
      makeNode({
        id: 'approval-1',
        type: 'approval',
        name: 'Refund approval',
        status: 'waiting',
        startedAt: '2026-03-22T10:03:00.000Z',
        input: { amount: 200 }
      })
    ]

    const nextNodes = applyEvent(nodes, {
      type: 'ApprovalResolved',
      nodeId: 'approval-1',
      completedAt: '2026-03-22T10:04:00.000Z',
      output: { decision: 'approved' }
    })

    expect(nextNodes[0]).toMatchObject({
      id: 'approval-1',
      type: 'approval',
      status: 'complete',
      completedAt: '2026-03-22T10:04:00.000Z',
      output: { decision: 'approved' }
    })
  })

  it('handles out-of-order events by merging a late start into an already completed node', () => {
    const afterCompletion = applyEvent([], {
      type: 'NodeCompleted',
      nodeId: 'child',
      completedAt: '2026-03-22T10:05:00.000Z',
      parentId: 'parent',
      name: 'Fetch order'
    })

    const afterLateStart = applyEvent(afterCompletion, {
      type: 'NodeStarted',
      node: {
        id: 'child',
        parentId: 'parent',
        type: 'tool',
        name: 'Fetch order',
        startedAt: '2026-03-22T10:04:00.000Z',
        input: { orderId: 'ord_123' }
      }
    })

    const finalNodes = applyEvent(afterLateStart, {
      type: 'NodeStarted',
      node: {
        id: 'parent',
        parentId: null,
        type: 'agent',
        name: 'Order agent',
        startedAt: '2026-03-22T10:03:00.000Z'
      }
    })

    expect(finalNodes).toHaveLength(1)
    expect(finalNodes[0]?.id).toBe('parent')
    expect(finalNodes[0]?.children[0]).toMatchObject({
      id: 'child',
      parentId: 'parent',
      type: 'tool',
      status: 'complete',
      startedAt: '2026-03-22T10:04:00.000Z',
      completedAt: '2026-03-22T10:05:00.000Z',
      input: { orderId: 'ord_123' }
    })
  })

  it('keeps nodes at the root when their parent is missing', () => {
    const nextNodes = applyEvent([], {
      type: 'NodeStarted',
      node: {
        id: 'orphan',
        parentId: 'missing-parent',
        type: 'tool',
        name: 'Detached tool',
        startedAt: '2026-03-22T10:06:00.000Z'
      }
    })

    expect(nextNodes).toEqual([
      makeNode({
        id: 'orphan',
        parentId: 'missing-parent',
        type: 'tool',
        name: 'Detached tool',
        status: 'running',
        startedAt: '2026-03-22T10:06:00.000Z'
      })
    ])
  })

  it('creates placeholder nodes for failure events that arrive before start metadata', () => {
    const nextNodes = applyEvent([], {
      type: 'NodeFailed',
      nodeId: 'tool-2',
      completedAt: '2026-03-22T10:07:00.000Z',
      error: 'Timed out',
      parentId: 'root',
      nodeType: 'tool',
      name: 'Sync ledger'
    })

    expect(nextNodes).toEqual([
      makeNode({
        id: 'tool-2',
        parentId: 'root',
        type: 'tool',
        name: 'Sync ledger',
        status: 'error',
        completedAt: '2026-03-22T10:07:00.000Z',
        error: 'Timed out'
      })
    ])
  })
})
