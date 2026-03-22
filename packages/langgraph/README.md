# agenttrace-langgraph

LangGraph JS adapter for `agenttrace-react`.

## Install

```bash
npm install agenttrace-react agenttrace-langgraph
# or
pnpm add agenttrace-react agenttrace-langgraph
```

## Peer dependencies

- `@langchain/langgraph`
- `react`

## Exports

- `langGraphEventToTraceEvent(event)`
- `useLangGraphTrace(stream)`

## Usage

```tsx
import { TraceProvider, TraceTree, TraceNode } from 'agenttrace-react'
import { useLangGraphTrace } from 'agenttrace-langgraph'

export function LangGraphTraceView({ stream }) {
  const run = useLangGraphTrace(stream)

  return (
    <TraceProvider run={run}>
      <TraceTree>
        {({ node }) => (
          <TraceNode node={node}>
            {({ name, status }) => <div>{name}: {status}</div>}
          </TraceNode>
        )}
      </TraceTree>
    </TraceProvider>
  )
}
```

## Notes

- Designed for LangGraph JS streaming in updates mode.
- Supports interrupts by mapping them into `ApprovalRequested` events.
- Returns a live `AgentRun` compatible with `TraceProvider`.

## Repository

[github.com/agenttrace/react](https://github.com/agenttrace/react)

## License

MIT
