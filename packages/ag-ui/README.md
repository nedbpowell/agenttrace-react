# agenttrace-ag-ui

AG-UI protocol adapter for `agenttrace-react`.

## Install

```bash
npm install agenttrace-react agenttrace-ag-ui
# or
pnpm add agenttrace-react agenttrace-ag-ui
```

## Peer dependencies

- `react`

## Exports

- `agUiToTraceEvent(event)`
- `useAgUiTrace(agentUrl)`

## Usage

```tsx
import { TraceProvider, TraceTree, TraceNode } from 'agenttrace-react'
import { useAgUiTrace } from 'agenttrace-ag-ui'

export function AgUiTraceView() {
  const run = useAgUiTrace('/api/agent/stream')

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

## Supported AG-UI events

- `RUN_STARTED`
- `RUN_FINISHED`
- `RUN_ERROR`
- `STEP_STARTED`
- `STEP_FINISHED`
- `TOOL_CALL_START`
- `TOOL_CALL_END`
- `CUSTOM` for human-in-the-loop approval flows

## Notes

- `useAgUiTrace()` connects to an AG-UI SSE endpoint with `EventSource`.
- Returns a live `AgentRun` compatible with `TraceProvider`.

## Repository

[github.com/agenttrace/react](https://github.com/agenttrace/react)

## License

MIT
