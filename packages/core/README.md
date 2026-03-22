# agenttrace-react

Headless React primitives for building AI agent UIs — execution trace visualisation, human-in-the-loop approval gates, and agent status dashboards. Works with LangGraph, AG-UI protocol, and the Vercel AI SDK. Zero styling, full control.

[![npm version](https://img.shields.io/npm/v/agenttrace-react)](https://www.npmjs.com/package/agenttrace-react)
[![npm downloads](https://img.shields.io/npm/dw/agenttrace-react)](https://www.npmjs.com/package/agenttrace-react)
[![license](https://img.shields.io/npm/l/agenttrace-react)](./LICENSE)

## Install

```bash
npm install agenttrace-react
# or
pnpm add agenttrace-react
```

## Use cases

- Visualising multi-step agent runs in real time
- Building human-in-the-loop (HITL) approval workflows
- Rendering tool call outputs in a structured UI
- Monitoring agent status and execution time
- Adding oversight UI to LangGraph or AG-UI agents

## Works with

| Framework | Adapter |
|-----------|---------|
| LangGraph | `agenttrace-langgraph` |
| AG-UI protocol | `agenttrace-ag-ui` |
| Vercel AI SDK | coming soon |
| Any agent framework | bring your own events via `applyEvent()` |

## What you get

- `TraceProvider` — context provider, owns trace state
- `TraceTree` — recursively renders the agent node tree
- `TraceNode` — renders a single node via render props
- `ApprovalGate` — renders only when a node needs human approval
- `RunStatus` — exposes run status and elapsed time
- `useTrace()` — hook for direct trace state access
- `applyEvent()` and full TypeScript types

## Quick start

```tsx
import {
  TraceProvider,
  TraceTree,
  TraceNode,
  ApprovalGate,
  RunStatus
} from 'agenttrace-react'

export function AgentView({ run }) {
  return (
    <TraceProvider
      run={run}
      onApprovalAction={(id, decision) => {
        console.log(id, decision)
      }}
    >
      <RunStatus>
        {({ status, elapsed }) => <div>Status: {status} ({elapsed}ms)</div>}
      </RunStatus>

      <TraceTree>
        {({ node }) => (
          <TraceNode node={node}>
            {({ name, status, type }) => (
              <div data-status={status} data-type={type}>
                {name}
              </div>
            )}
          </TraceNode>
        )}
      </TraceTree>

      <ApprovalGate>
        {({ approve, reject, context }) => (
          <div>
            <p>{context.description}</p>
            <button onClick={approve}>Approve</button>
            <button onClick={reject}>Reject</button>
          </div>
        )}
      </ApprovalGate>
    </TraceProvider>
  )
}
```

## Philosophy

`agenttrace-react` is intentionally unstyled. It manages trace state and rendering logic, while your app keeps full control over markup, layout, and design system integration. Bring Tailwind, shadcn/ui, or your own components — no overrides needed.

## Companion packages

- [`agenttrace-langgraph`](https://www.npmjs.com/package/agenttrace-langgraph) — adapter for LangGraph JS stream events
- [`agenttrace-ag-ui`](https://www.npmjs.com/package/agenttrace-ag-ui) — adapter for AG-UI protocol SSE events

## Repository

[github.com/nedbpowell/agenttrace-react](https://github.com/nedbpowell/agenttrace-react)

## License

MIT