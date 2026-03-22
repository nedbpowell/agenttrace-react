# agenttrace-langgraph

LangGraph JS adapter for [agenttrace-react](https://www.npmjs.com/package/agenttrace-react) — visualise LangGraph agent execution traces, tool calls, and human-in-the-loop interrupts as a live React UI.

[![npm version](https://img.shields.io/npm/v/agenttrace-langgraph)](https://www.npmjs.com/package/agenttrace-langgraph)
[![npm downloads](https://img.shields.io/npm/dw/agenttrace-langgraph)](https://www.npmjs.com/package/agenttrace-langgraph)
[![license](https://img.shields.io/npm/l/agenttrace-langgraph)](./LICENSE)

## Install

```bash
npm install agenttrace-react agenttrace-langgraph
# or
pnpm add agenttrace-react agenttrace-langgraph
```

## Use cases

- Rendering a live execution trace for a LangGraph agent run
- Visualising tool calls and sub-agent steps as they stream in
- Surfacing LangGraph `__interrupt__` events as human-in-the-loop approval gates
- Building oversight UIs for LangGraph-powered workflows

## Peer dependencies

- `agenttrace-react`
- `@langchain/langgraph`
- `react`

## Exports

- `useLangGraphTrace(stream)` — consumes a LangGraph stream and returns a live `AgentRun`
- `langGraphEventToTraceEvent(event)` — maps a single LangGraph stream event to a `TraceEvent`

## Usage

```tsx
import { TraceProvider, TraceTree, TraceNode, ApprovalGate } from 'agenttrace-react'
import { useLangGraphTrace } from 'agenttrace-langgraph'

export function LangGraphTraceView({ stream, onApproval }) {
  const run = useLangGraphTrace(stream)

  return (
    <TraceProvider run={run} onApprovalAction={onApproval}>
      <TraceTree>
        {({ node }) => (
          <TraceNode node={node}>
            {({ name, status, type }) => (
              <div data-status={status} data-type={type}>
                {name}: {status}
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
}
```

## How it works

- Designed for LangGraph JS streaming in **updates mode**
- Maps LangGraph node updates to `NodeStarted` / `NodeCompleted` / `NodeFailed` trace events
- Infers node type (`agent`, `tool`, `approval`) from node name and update shape
- Maps `__interrupt__` events to `ApprovalRequested` — pausing the UI until the user decides
- Returns a live `AgentRun` compatible with `agenttrace-react`'s `TraceProvider`

## Related packages

- [`agenttrace-react`](https://www.npmjs.com/package/agenttrace-react) — core headless primitives
- [`agenttrace-ag-ui`](https://www.npmjs.com/package/agenttrace-ag-ui) — AG-UI protocol adapter

## Repository

[github.com/nedbpowell/agenttrace-react](https://github.com/nedbpowell/agenttrace-react)

## License

MIT