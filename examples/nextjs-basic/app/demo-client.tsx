'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLangGraphTrace, type LangGraphStreamEvent } from 'agenttrace-langgraph'
import {
  ApprovalGate,
  RunStatus,
  TraceNode,
  TraceProvider,
  TraceTree,
  type AgentNode
} from 'agenttrace-react'

type ApprovalDecision = 'approve' | 'reject'

type MockController = ReturnType<typeof createMockController>

function createMockController() {
  let resolveDecision: ((decision: ApprovalDecision) => void) | null = null
  let approvalPromise = new Promise<ApprovalDecision>((resolve) => {
    resolveDecision = resolve
  })

  return {
    async wait(duration: number) {
      await new Promise((resolve) => window.setTimeout(resolve, duration))
    },
    async waitForApproval() {
      return approvalPromise
    },
    settle(decision: ApprovalDecision) {
      resolveDecision?.(decision)
      approvalPromise = new Promise<ApprovalDecision>((resolve) => {
        resolveDecision = resolve
      })
    }
  }
}

function elapsedLabel(startedAt: string | null, completedAt: string | null, now: number) {
  if (!startedAt) {
    return 'pending'
  }

  const start = Date.parse(startedAt)
  const end = completedAt ? Date.parse(completedAt) : now
  const elapsed = Math.max(end - start, 0)

  if (elapsed < 1000) {
    return `${elapsed}ms`
  }

  return `${(elapsed / 1000).toFixed(elapsed < 10000 ? 1 : 0)}s`
}

function statusTone(status: AgentNode['status']) {
  switch (status) {
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'running':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'waiting':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600'
  }
}

function statusLabel(status: AgentNode['status']) {
  switch (status) {
    case 'complete':
      return 'Complete'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Awaiting approval'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

function StatusIcon({ status }: { status: AgentNode['status'] | 'complete' }) {
  if (status === 'running') {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-white/80 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </span>
    )
  }

  if (status === 'complete') {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm">
        <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M7.6 13.2 4.4 10l-1.4 1.4 4.6 4.6L17 6.6l-1.4-1.4z" />
        </svg>
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
        <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="m11.4 10 4.3-4.3-1.4-1.4-4.3 4.3-4.3-4.3-1.4 1.4L8.6 10l-4.3 4.3 1.4 1.4 4.3-4.3 4.3 4.3 1.4-1.4z" />
        </svg>
      </span>
    )
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 shadow-sm">
      <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M10 4a1 1 0 0 1 1 1v4.2l2.6 1.6-.8 1.3-3.2-2V5a1 1 0 0 1 1-1Zm0-3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
      </svg>
    </span>
  )
}

function createMockStream(controller: MockController): AsyncIterable<LangGraphStreamEvent> {
  const timestamp = (offsetMs: number) =>
    new Date(Date.now() + offsetMs).toISOString()

  return {
    async *[Symbol.asyncIterator]() {
      const runId = 'demo-retention-run'
      const rootId = 'agent:retention'
      const searchStepId = 'step:search'
      const approvalId = 'approval:refund-email'

      yield {
        runId,
        timestamp: timestamp(0),
        orchestrator: {
          phase: 'start',
          nodeId: rootId,
          nodeType: 'agent',
          name: 'Retention agent',
          input: {
            customer: 'Acme Co',
            request: 'Approve a proactive refund and follow-up email'
          }
        }
      }

      await controller.wait(800)

      yield {
        runId,
        timestamp: timestamp(800),
        plan: {
          phase: 'start',
          nodeId: 'step:plan',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Plan remediation',
          input: {
            goal: 'Draft a refund recommendation and outreach plan'
          }
        }
      }

      await controller.wait(1200)

      yield {
        runId,
        timestamp: timestamp(2000),
        plan: {
          phase: 'complete',
          nodeId: 'step:plan',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Plan remediation',
          completedAt: timestamp(2000),
          output: {
            summary: 'Need supporting web signals and manager sign-off before sending.'
          }
        }
      }

      await controller.wait(500)

      yield {
        runId,
        timestamp: timestamp(2500),
        research: {
          phase: 'start',
          nodeId: searchStepId,
          parentId: rootId,
          nodeType: 'agent',
          name: 'Search the web',
          input: {
            queries: [
              'refund best practices saas outage communication',
              'customer retention outreach examples',
              'support escalation email tone examples'
            ]
          }
        }
      }

      for (const [index, query] of [
        'refund best practices saas outage communication',
        'customer retention outreach examples',
        'support escalation email tone examples'
      ].entries()) {
        const startOffset = 3200 + index * 900
        const endOffset = startOffset + 700
        const toolId = `tool:search-${index + 1}`

        await controller.wait(index === 0 ? 700 : 200)

        yield {
          runId,
          timestamp: timestamp(startOffset),
          [`search_${index + 1}`]: {
            phase: 'start',
            nodeId: toolId,
            parentId: searchStepId,
            nodeType: 'tool',
            name: `Web search ${index + 1}`,
            input: { query }
          }
        }

        await controller.wait(700)

        yield {
          runId,
          timestamp: timestamp(endOffset),
          [`search_${index + 1}`]: {
            phase: 'complete',
            nodeId: toolId,
            parentId: searchStepId,
            nodeType: 'tool',
            name: `Web search ${index + 1}`,
            completedAt: timestamp(endOffset),
            output: {
              topHit:
                index === 0
                  ? 'SaaS refund playbook recommends proactive follow-up within 24h.'
                  : index === 1
                    ? 'Retention teams pair refunds with a high-empathy recap email.'
                    : 'Escalation emails perform best when specific next steps are explicit.'
            }
          }
        }
      }

      await controller.wait(300)

      yield {
        runId,
        timestamp: timestamp(6200),
        research: {
          phase: 'complete',
          nodeId: searchStepId,
          parentId: rootId,
          nodeType: 'agent',
          name: 'Search the web',
          completedAt: timestamp(6200),
          output: {
            highlights: 3
          }
        }
      }

      await controller.wait(450)

      yield {
        runId,
        timestamp: timestamp(6650),
        synthesise: {
          phase: 'start',
          nodeId: 'step:synthesise',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Synthesise recommendation',
          input: {
            sources: 3
          }
        }
      }

      await controller.wait(1200)

      yield {
        runId,
        timestamp: timestamp(7850),
        synthesise: {
          phase: 'complete',
          nodeId: 'step:synthesise',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Synthesise recommendation',
          completedAt: timestamp(7850),
          output: {
            decision: 'Recommend refund plus apology email, pending human sign-off.'
          }
        }
      }

      await controller.wait(350)

      yield {
        runId,
        timestamp: timestamp(8200),
        __interrupt__: [
          {
            ns: ['approval', 'refund_email'],
            value: {
              approvalId: 'refund-email',
              parentId: rootId,
              name: 'Human approval',
              input: {
                customer: 'Acme Co',
                amount: '$245 credit',
                draft: 'Offer refund credit and send a follow-up summary email.'
              }
            }
          }
        ]
      }

      const decision = await controller.waitForApproval()

      yield {
        runId,
        timestamp: timestamp(9100),
        approval_resolution: {
          phase: 'resolved',
          nodeId: approvalId,
          parentId: rootId,
          nodeType: 'approval',
          name: 'Human approval',
          completedAt: timestamp(9100),
          output: {
            decision
          }
        }
      }

      if (decision === 'reject') {
        await controller.wait(400)

        yield {
          runId,
          timestamp: timestamp(9500),
          orchestrator: {
            phase: 'error',
            nodeId: rootId,
            parentId: null,
            nodeType: 'agent',
            name: 'Retention agent',
            completedAt: timestamp(9500),
            error: 'Reviewer rejected the outreach plan.'
          }
        }

        return
      }

      await controller.wait(500)

      yield {
        runId,
        timestamp: timestamp(9600),
        send_email: {
          phase: 'start',
          nodeId: 'tool:send-email',
          parentId: rootId,
          nodeType: 'tool',
          name: 'Send follow-up email',
          input: {
            channel: 'email',
            to: 'ops@acme.co'
          }
        }
      }

      await controller.wait(1100)

      yield {
        runId,
        timestamp: timestamp(10700),
        send_email: {
          phase: 'complete',
          nodeId: 'tool:send-email',
          parentId: rootId,
          nodeType: 'tool',
          name: 'Send follow-up email',
          completedAt: timestamp(10700),
          output: {
            messageId: 'msg_demo_90210'
          }
        }
      }

      await controller.wait(300)

      yield {
        runId,
        timestamp: timestamp(11000),
        orchestrator: {
          phase: 'complete',
          nodeId: rootId,
          parentId: null,
          nodeType: 'agent',
          name: 'Retention agent',
          completedAt: timestamp(11000),
          output: {
            summary: 'Refund approved and follow-up email sent.'
          }
        }
      }
    }
  }
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return now
}

function JsonPreview({ value }: { value: unknown }) {
  if (value == null) {
    return null
  }

  return (
    <pre className="overflow-x-auto rounded-2xl bg-slate-950/90 px-4 py-3 text-[11px] leading-5 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function TimelineNode({
  node,
  level,
  now
}: {
  node: AgentNode
  level: number
  now: number
}) {
  return (
    <TraceNode node={node}>
      {({ name, status, type, timestamps }) => (
        <div
          className="relative"
          style={{ paddingLeft: `${(level - 1) * 24}px` }}
        >
          {level > 1 ? (
            <div className="absolute left-[11px] top-0 h-full w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
          ) : null}

          <div className="relative mb-5 rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="absolute left-[-4px] top-6 h-px w-4 bg-slate-200" />
            <div className="flex items-start gap-4">
              <StatusIcon status={status} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                        {name}
                      </h3>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {status === 'waiting'
                        ? 'Needs a human decision before the agent can continue.'
                        : status === 'running'
                          ? 'Streaming progress from the orchestrator in real time.'
                          : status === 'error'
                            ? node.error ?? 'The node ended with an error.'
                            : 'Finished successfully.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
                      {elapsedLabel(timestamps.startedAt, timestamps.completedAt, now)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-500 md:grid-cols-2">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Started
                    </span>
                    <span>{timestamps.startedAt ? new Date(timestamps.startedAt).toLocaleTimeString() : 'Pending'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Finished
                    </span>
                    <span>{timestamps.completedAt ? new Date(timestamps.completedAt).toLocaleTimeString() : 'In progress'}</span>
                  </div>
                </div>

                {node.output ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Output
                    </p>
                    <JsonPreview value={node.output} />
                  </div>
                ) : null}

                <ApprovalGate>
                  {({ approve, reject, context }) => (
                    <div className="mt-5 overflow-hidden rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-inner">
                      <div className="relative border-b border-amber-200/70 px-5 py-4">
                        <div className="absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                          Approval gate
                        </p>
                        <h4 className="mt-2 text-lg font-semibold text-slate-950">
                          {context.description}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">
                          The run is paused here until a reviewer confirms the next action.
                        </p>
                      </div>

                      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.2fr_0.8fr]">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Context
                          </p>
                          <JsonPreview value={context.input} />
                        </div>

                        <div className="flex flex-col justify-between rounded-2xl border border-white/80 bg-white/80 p-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Decide whether to send the apology and refund note.
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Approving resumes the stream, sends the follow-up email, and completes the run.
                            </p>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-3">
                            <button
                              onClick={approve}
                              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                              Approve
                            </button>
                            <button
                              onClick={reject}
                              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </ApprovalGate>
              </div>
            </div>
          </div>
        </div>
      )}
    </TraceNode>
  )
}

function DemoTrace() {
  const controllerRef = useRef<MockController | null>(null)

  if (controllerRef.current === null) {
    controllerRef.current = createMockController()
  }

  const stream = useMemo(
    () => createMockStream(controllerRef.current as MockController),
    []
  )
  const run = useLangGraphTrace(stream)
  const now = useNow()

  return (
    <TraceProvider
      run={run}
      onApprovalAction={(_, decision) => {
        ;(controllerRef.current as MockController).settle(decision)
      }}
    >
      <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,107,53,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.16),transparent_35%)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-500">
              Readme demo
            </p>
            <h1 className="mt-4 max-w-[10ch] text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-slate-950 sm:text-6xl">
              Watch a live agent trace unfold.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              This mock run follows a realistic support workflow: plan the recovery,
              search the web for evidence, synthesise a recommendation, pause for a
              human decision, then send the customer email.
            </p>

            <RunStatus>
              {({ status, elapsed }) => (
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${statusTone(status)}`}
                  >
                    {statusLabel(status)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700">
                    Run {elapsed != null ? elapsedLabel(run.startedAt, run.completedAt, Date.now()) : 'pending'}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm text-slate-500">
                    {run.id}
                  </span>
                </div>
              )}
            </RunStatus>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Steps', '4 stages + 4 nodes'],
                ['Approval', 'Human sign-off in the loop'],
                ['Output', 'Email sent on approval']
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative rounded-[32px] border border-slate-200/80 bg-white/70 p-6 shadow-xl backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-600">
                Live execution trace
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Multi-step timeline
              </h2>
            </div>
            <div className="hidden rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm text-slate-500 sm:block">
              Tailwind-styled headless primitives
            </div>
          </div>

          <div className="max-h-[74vh] overflow-y-auto pr-2">
            <TraceTree>
              {({ node, level }) => <TimelineNode node={node} level={level} now={now} />}
            </TraceTree>
          </div>
        </section>
      </div>
    </TraceProvider>
  )
}

export default function DemoClient() {
  const [replayKey, setReplayKey] = useState(0)

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fdf7ef_0%,#eef5ff_45%,#f5fbf7_100%)] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setReplayKey((current) => current + 1)}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            Replay demo
          </button>
        </div>
        <DemoTrace key={replayKey} />
      </div>
    </main>
  )
}
