'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock3, LoaderCircle, Mail, Play, Search, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { useLangGraphTrace, type LangGraphStreamEvent } from 'agenttrace-langgraph'
import {
  ApprovalGate,
  RunStatus,
  TraceNode,
  TraceProvider,
  TraceTree,
  type AgentNode
} from 'agenttrace-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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

function createMockStream(controller: MockController): AsyncIterable<LangGraphStreamEvent> {
  const timestamp = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

  return {
    async *[Symbol.asyncIterator]() {
      const runId = 'demo-shadcn-run'
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
            request: 'Review refund path and draft a follow-up email'
          }
        }
      }

      await controller.wait(600)
      yield {
        runId,
        timestamp: timestamp(600),
        plan: {
          phase: 'start',
          nodeId: 'step:plan',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Plan remediation',
          input: {
            goal: 'Outline a high-confidence remediation flow'
          }
        }
      }

      await controller.wait(900)
      yield {
        runId,
        timestamp: timestamp(1500),
        plan: {
          phase: 'complete',
          nodeId: 'step:plan',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Plan remediation',
          completedAt: timestamp(1500),
          output: {
            summary: 'Need evidence, then human sign-off before sending outreach.'
          }
        }
      }

      await controller.wait(400)
      yield {
        runId,
        timestamp: timestamp(1900),
        search: {
          phase: 'start',
          nodeId: searchStepId,
          parentId: rootId,
          nodeType: 'agent',
          name: 'Search the web',
          input: {
            queries: [
              'saas refund retention email examples',
              'support outage customer recovery best practices',
              'proactive support follow-up templates'
            ]
          }
        }
      }

      for (const [index, query] of [
        'saas refund retention email examples',
        'support outage customer recovery best practices',
        'proactive support follow-up templates'
      ].entries()) {
        const base = 2500 + index * 1000
        const toolId = `tool:search-${index + 1}`

        await controller.wait(350)
        yield {
          runId,
          timestamp: timestamp(base),
          [`search_${index + 1}`]: {
            phase: 'start',
            nodeId: toolId,
            parentId: searchStepId,
            nodeType: 'tool',
            name: `Web search ${index + 1}`,
            input: { query }
          }
        }

        await controller.wait(650)
        yield {
          runId,
          timestamp: timestamp(base + 650),
          [`search_${index + 1}`]: {
            phase: 'complete',
            nodeId: toolId,
            parentId: searchStepId,
            nodeType: 'tool',
            name: `Web search ${index + 1}`,
            completedAt: timestamp(base + 650),
            output: {
              topHit:
                index === 0
                  ? 'Teams pair refunds with a concise empathy-first follow-up.'
                  : index === 1
                    ? 'Strong recovery flows explain what changed and what happens next.'
                    : 'Templates with clear owners and timelines reduce churn.'
            }
          }
        }
      }

      await controller.wait(250)
      yield {
        runId,
        timestamp: timestamp(5600),
        search: {
          phase: 'complete',
          nodeId: searchStepId,
          parentId: rootId,
          nodeType: 'agent',
          name: 'Search the web',
          completedAt: timestamp(5600),
          output: {
            highlights: 3
          }
        }
      }

      await controller.wait(400)
      yield {
        runId,
        timestamp: timestamp(6000),
        synthesise: {
          phase: 'start',
          nodeId: 'step:synthesise',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Synthesise recommendation',
          input: {
            evidenceCount: 3
          }
        }
      }

      await controller.wait(900)
      yield {
        runId,
        timestamp: timestamp(6900),
        synthesise: {
          phase: 'complete',
          nodeId: 'step:synthesise',
          parentId: rootId,
          nodeType: 'agent',
          name: 'Synthesise recommendation',
          completedAt: timestamp(6900),
          output: {
            recommendation: 'Recommend refund and outreach email pending manager approval.'
          }
        }
      }

      await controller.wait(300)
      yield {
        runId,
        timestamp: timestamp(7200),
        __interrupt__: [
          {
            ns: ['approval', 'refund_email'],
            value: {
              approvalId: 'refund-email',
              parentId: rootId,
              name: 'Human approval',
              input: {
                amount: '$245 credit',
                draft: 'Share refund, acknowledge impact, and outline next steps.'
              }
            }
          }
        ]
      }

      const decision = await controller.waitForApproval()

      yield {
        runId,
        timestamp: timestamp(7900),
        approval_resolution: {
          phase: 'resolved',
          nodeId: approvalId,
          parentId: rootId,
          nodeType: 'approval',
          name: 'Human approval',
          completedAt: timestamp(7900),
          output: {
            decision
          }
        }
      }

      if (decision === 'reject') {
        await controller.wait(400)
        yield {
          runId,
          timestamp: timestamp(8300),
          orchestrator: {
            phase: 'error',
            nodeId: rootId,
            parentId: null,
            nodeType: 'agent',
            name: 'Retention agent',
            completedAt: timestamp(8300),
            error: 'Reviewer rejected the outreach package.'
          }
        }
        return
      }

      await controller.wait(350)
      yield {
        runId,
        timestamp: timestamp(8600),
        send_email: {
          phase: 'start',
          nodeId: 'tool:send-email',
          parentId: rootId,
          nodeType: 'tool',
          name: 'Send follow-up email',
          input: {
            channel: 'email',
            recipient: 'ops@acme.co'
          }
        }
      }

      await controller.wait(800)
      yield {
        runId,
        timestamp: timestamp(9400),
        send_email: {
          phase: 'complete',
          nodeId: 'tool:send-email',
          parentId: rootId,
          nodeType: 'tool',
          name: 'Send follow-up email',
          completedAt: timestamp(9400),
          output: {
            messageId: 'msg_demo_shadcn'
          }
        }
      }

      await controller.wait(200)
      yield {
        runId,
        timestamp: timestamp(9600),
        orchestrator: {
          phase: 'complete',
          nodeId: rootId,
          parentId: null,
          nodeType: 'agent',
          name: 'Retention agent',
          completedAt: timestamp(9600),
          output: {
            summary: 'Refund approved and the follow-up email has been sent.'
          }
        }
      }
    }
  }
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => window.clearInterval(id)
  }, [])

  return now
}

function elapsedLabel(startedAt: string | null, completedAt: string | null, now: number) {
  if (!startedAt) {
    return 'Pending'
  }

  const start = Date.parse(startedAt)
  const end = completedAt ? Date.parse(completedAt) : now
  const elapsed = Math.max(end - start, 0)

  if (elapsed < 1000) {
    return `${elapsed}ms`
  }

  return `${(elapsed / 1000).toFixed(elapsed < 10000 ? 1 : 0)}s`
}

function statusBadgeVariant(status: AgentNode['status']) {
  switch (status) {
    case 'complete':
      return 'success' as const
    case 'running':
      return 'info' as const
    case 'waiting':
      return 'warning' as const
    case 'error':
      return 'error' as const
    default:
      return 'outline' as const
  }
}

function statusLabel(status: AgentNode['status']) {
  switch (status) {
    case 'complete':
      return 'Complete'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Waiting'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

function statusIcon(status: AgentNode['status']) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    case 'running':
      return <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />
    case 'waiting':
      return <Clock3 className="h-4 w-4 text-amber-600" />
    case 'error':
      return <XCircle className="h-4 w-4 text-rose-600" />
    default:
      return <Clock3 className="h-4 w-4 text-muted-foreground" />
  }
}

function nodeGlyph(type: AgentNode['type']) {
  switch (type) {
    case 'tool':
      return <Search className="h-4 w-4" />
    case 'approval':
      return <ShieldAlert className="h-4 w-4" />
    default:
      return <Sparkles className="h-4 w-4" />
  }
}

function JsonPreview({ value }: { value: unknown }) {
  if (value == null) {
    return null
  }

  return (
    <pre className="overflow-x-auto rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function TimelineItem({
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
        <div className="relative" style={{ paddingLeft: `${(level - 1) * 22}px` }}>
          {level > 1 ? (
            <div className="absolute left-[12px] top-0 h-full w-px bg-border" />
          ) : null}
          <div className="relative mb-4 rounded-lg border bg-card p-4 shadow-sm">
            <div className="absolute left-[-1px] top-7 h-px w-3 bg-border" />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border bg-background">
                {statusIcon(status)}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {nodeGlyph(type)}
                        <span className="uppercase tracking-wide text-[11px]">{type}</span>
                      </span>
                      <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {status === 'waiting'
                          ? 'Paused for a human decision before the run continues.'
                          : status === 'running'
                            ? 'Streaming live agent activity.'
                            : status === 'error'
                              ? node.error ?? 'Node failed.'
                              : 'Finished successfully.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {elapsedLabel(timestamps.startedAt, timestamps.completedAt, now)}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide">Started</div>
                    <div>{timestamps.startedAt ? new Date(timestamps.startedAt).toLocaleTimeString() : 'Pending'}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide">Completed</div>
                    <div>{timestamps.completedAt ? new Date(timestamps.completedAt).toLocaleTimeString() : 'In progress'}</div>
                  </div>
                </div>

                {node.output ? (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Output
                    </div>
                    <JsonPreview value={node.output} />
                  </div>
                ) : null}

                <ApprovalGate>
                  {({ approve, reject, context }) => (
                    <Card className="border-amber-200 bg-amber-50/60">
                      <CardHeader>
                        <CardTitle className="text-base">Approval required</CardTitle>
                        <CardDescription>
                          Review the proposed outreach package before the run can continue.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <JsonPreview value={context.input} />
                      </CardContent>
                      <CardFooter className="gap-2">
                        <Button onClick={approve}>Approve</Button>
                        <Button variant="outline" onClick={reject}>
                          Reject
                        </Button>
                      </CardFooter>
                    </Card>
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
  const nodeCount = run.nodes.length

  return (
    <TraceProvider
      run={run}
      onApprovalAction={(_, decision) => {
        ;(controllerRef.current as MockController).settle(decision)
      }}
    >
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="border-primary/15 shadow-lg shadow-primary/5">
            <CardHeader className="space-y-4">
              <Badge variant="outline" className="w-fit">
                shadcn/ui themed example
              </Badge>
              <div className="space-y-2">
                <CardTitle className="text-3xl tracking-tight">
                  Familiar UI for teams already using shadcn/ui
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  Same headless trace primitives, but wrapped with cards, badges,
                  buttons, separators, and layout patterns that feel native in a
                  typical shadcn-based app.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <RunStatus>
                {({ status, elapsed }) => (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
                      <Badge variant="outline">
                        {elapsed != null ? elapsedLabel(run.startedAt, run.completedAt, Date.now()) : 'Pending'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">Run ID: {run.id}</div>
                  </div>
                )}
              </RunStatus>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  ['Flow', 'Plan → Search ×3 → Synthesise → Approval → Email'],
                  ['Nodes', `${nodeCount} top-level node${nodeCount === 1 ? '' : 's'}`],
                  ['Use case', 'Customer recovery and proactive outreach']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </div>
                    <div className="mt-1 text-sm font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Execution timeline</CardTitle>
                <CardDescription>
                  A copy-paste-ready starting point for shadcn/ui projects.
                </CardDescription>
              </div>
              <Badge variant="secondary">Live trace</Badge>
            </div>
            <Separator />
          </CardHeader>
          <CardContent className="max-h-[75vh] overflow-y-auto">
            <TraceTree>
              {({ node, level }) => <TimelineItem node={node} level={level} now={now} />}
            </TraceTree>
          </CardContent>
        </Card>
      </div>
    </TraceProvider>
  )
}

export default function DemoClient() {
  const [replayKey, setReplayKey] = useState(0)

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setReplayKey((current) => current + 1)}>
            <Play className="mr-2 h-4 w-4" />
            Replay demo
          </Button>
        </div>
        <DemoTrace key={replayKey} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" />
          Styled with local shadcn-style primitives on top of agenttrace headless components.
        </div>
      </div>
    </main>
  )
}
