# Studio UI Guide

This doc covers common UI workflows after you are connected to a gateway.

## Cron jobs in Agent Settings

- Open an agent and go to **Settings -> Cron jobs**.
- If no jobs exist, use the empty-state **Create** button.
- If jobs already exist, use the header **Create** button.
- The modal is agent-scoped and walks through template selection, task text, schedule, and review.
- Submitting creates the job via gateway `cron.add` and refreshes that same agent's cron list.

## Agent creation workflow

- Click **New Agent** in the fleet sidebar.
- Enter an agent name and avatar, then create.
- The create modal does not include permission controls.
- After create succeeds, Studio opens **Settings** for the new agent automatically.
- New agents bootstrap to **Autonomous** command mode by default.
- Use **Settings -> Permissions** for preset controls (Conservative, Collaborative, Autonomous) and optional advanced controls (`Command mode`, `Web access`, `File tools`).

## Exec approvals in chat

- When a run requires exec approval, chat shows an **Exec approval required** card with:
  - command preview
  - host and cwd
  - expiration timestamp
- Resolve directly in chat with:
  - **Allow once**
  - **Always allow**
  - **Deny**
- The fleet row displays **Needs approval** while approvals are pending for that agent.
- Expired approvals are pruned automatically, so stale cards and stale **Needs approval** badges clear without a manual resolve event.
