# agenttrace-ai-sdk

Vercel AI SDK adapter for `agenttrace-react`.

## Install

```bash
npm install agenttrace-react agenttrace-ai-sdk
# or
pnpm add agenttrace-react agenttrace-ai-sdk
```

## Peer dependencies

- `ai`
- `react`

## Exports

- `aiSdkMessageToTraceEvents(message)`
- `aiSdkMessagesToAgentRun(messages)`
- `useAiSdkTrace(messages)`

## Usage

```tsx
import { useChat } from '@ai-sdk/react'
import { TraceProvider, TraceTree, TraceNode } from 'agenttrace-react'
import { useAiSdkTrace } from 'agenttrace-ai-sdk'

export function AiSdkTraceView() {
  const { messages } = useChat()
  const run = useAiSdkTrace(messages)

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

- Designed for AI SDK UI messages from hooks like `useChat()`.
- Maps tool parts into `tool` trace nodes.
- Maps approval-like tool/data parts into `ApprovalRequested` and `ApprovalResolved`.
- Returns a live `AgentRun` compatible with `TraceProvider`.

## Repository

[github.com/nedbpowell/agenttrace-react](https://github.com/nedbpowell/agenttrace-react)

## License

MIT
