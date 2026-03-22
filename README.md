# agenttrace-react

> Headless React primitives for visualising AI agent execution traces.

[![npm version](https://img.shields.io/npm/v/agenttrace-react)](https://www.npmjs.com/package/agenttrace-react)
[![npm downloads](https://img.shields.io/npm/dw/agenttrace-react)](https://www.npmjs.com/package/agenttrace-react)
[![license](https://img.shields.io/npm/l/agenttrace-react)](./LICENSE)

---

**What it is:** A zero-styling, headless component library for building agent operations UIs — execution trace trees, approval gates, agent status dashboards, and tool call visualisations.

**What it is not:** A chat UI library. Not an agent framework. No opinions on how your agent runs.

**Who it's for:** Developers building production UIs on top of LangGraph, the AG-UI protocol, or the Vercel AI SDK who need to visualise what their agent is actually doing.

---

![agenttrace-react demo](https://raw.githubusercontent.com/agenttrace/react/main/screenshots/demo.png)



## Install

```bash
npm install agenttrace-react
# or
pnpm add agenttrace-react
```

## Quick start

```tsx
import {
  TraceProvider,
  TraceTree,
  TraceNode,
  ApprovalGate,
  RunStatus,
  useTrace,
} from 'agenttrace-react'

export function AgentView({ run }) {
  return (
    <TraceProvider run={run} onApprovalAction={(id, decision) => console.log(id, decision)}>
      <RunStatus>
        {({ status, elapsed }) => (
          <div>Status: {status} — {elapsed}ms</div>
        )}
      </RunStatus>

      <TraceTree>
        {({ node }) => (
          <TraceNode node={node}>
            {({ name, status, type }) => (
              <div data-type={type} data-status={status}>
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

## Adapters

Install the adapter for your agent framework alongside the core library:

| Framework | Adapter | Install |
|-----------|---------|---------|
| LangGraph (JS) | `agenttrace-langgraph` | `npm i agenttrace-langgraph` |
| AG-UI protocol | `agenttrace-ag-ui` | `npm i agenttrace-ag-ui` |
| Vercel AI SDK | `agenttrace-ai-sdk` | `npm i agenttrace-ai-sdk` *(coming soon)* |

## Why headless?

Every team has a design system. Shipping styled components means you spend your first hour overriding CSS instead of building. `agenttrace-react` follows the [Radix UI](https://radix-ui.com) philosophy: own the state and behaviour, hand the markup entirely to you. Pair it with Tailwind, shadcn/ui, or your own design system — zero friction.

## Components

| Component | Description |
|-----------|-------------|
| `<TraceProvider>` | Context provider. Accepts an `AgentRun` and approval handler. |
| `<TraceTree>` | Recursively renders the agent node tree via render props. |
| `<TraceNode>` | Renders a single node — exposes `name`, `status`, `type`, `timestamps`. |
| `<ApprovalGate>` | Renders only when a node is in `waiting` status. Exposes `approve`/`reject`. |
| `<RunStatus>` | Exposes current run `status` and `elapsed` time via render props. |
| `useTrace()` | Hook returning full trace state and an `addEvent()` function. |

## Roadmap

- [x] Core headless components
- [ ] Publish LangGraph adapter package
- [ ] Publish AG-UI protocol adapter package
- [ ] Vercel AI SDK adapter
- [ ] Storybook with unstyled examples
- [ ] shadcn/ui themed example
- [ ] Multi-agent coordination view

## Contributing

PRs welcome. Open an issue first for anything substantial.

## License

MIT
