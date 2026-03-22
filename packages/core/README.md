# agenttrace-react

Headless React primitives for visualising AI agent execution traces.

## Install

```bash
npm install agenttrace-react
# or
pnpm add agenttrace-react
```

## What you get

- `TraceProvider`
- `TraceTree`
- `TraceNode`
- `ApprovalGate`
- `RunStatus`
- `useTrace()`
- `applyEvent()` and core trace types

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

`agenttrace-react` is intentionally unstyled. It manages trace state and rendering structure, while your app keeps full control over markup, layout, and design system integration.

## Companion packages

- `agenttrace-langgraph`
- `agenttrace-ag-ui`

## Repository

[github.com/nedbpowell/agenttrace-react](https://github.com/nedbpowell/agenttrace-react)

## License

MIT
