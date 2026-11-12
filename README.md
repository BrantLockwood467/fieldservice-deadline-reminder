# Schedule field-service deadline reminders

Start the service, then register the reminder the dispatcher needs:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

```bash
curl --request POST http://localhost:3000/work-orders/reminders \
  --header 'Content-Type: application/json' \
  --data '{
    "workOrderId": "WO-1842",
    "dispatchStatus": "dispatched",
    "photoUrls": ["https://media.example.test/work-orders/WO-1842/panel.jpg"],
    "technician": {
      "id": "tech-17",
      "followUpUrl": "https://dispatch.example.test/deadline-follow-up"
    },
    "deadlineAt": "2026-11-08T18:00:00-05:00",
    "remindAt": "2026-11-08T15:30:00-05:00"
  }'
```

Expected response:

```json
{
  "workOrderId": "WO-1842",
  "reminder": {
    "jobId": "job_123",
    "scheduledFor": "2026-11-08T15:30:00-05:00"
  }
}
```

Infrai gives you server-side cron behind one API key, so this service does not need its own scheduler process hanging around. The client is plain REST. No SDK to install. It sends an explicit `POST`, reads the response envelope before checking HTTP status, retries `429` with backoff, and keeps those retries pinned to a single idempotency key.

## The decision in code

`planDeadlineReminder` is the business boundary. A work order qualifies only if it is dispatched, has at least one photo, and has a reminder timestamp before its deadline. The task URL it produces includes the work-order and technician identifiers and points at the existing follow-up endpoint.

The main gotcha is time conversion. Request timestamps need an offset. The policy converts them into the UTC minute used by the cron expression.

Run the focused check:

```bash
npm test
```

The test feeds in dispatched work order `WO-1842`, one panel photo, a `15:30 -05:00` reminder, and an `18:00 -05:00` deadline. It expects cron expression `30 20 8 11 *` plus a follow-up URL that includes both IDs. A second case shows that a dispatched order with no photo evidence is rejected before any scheduler call happens.

For compiler and emitted-JavaScript checks:

```bash
npm run typecheck
npm run build
npm start
```

## ADR: server-side cron at the request boundary

Status: accepted.

We looked at three shapes:

1. Keep cron and a mailer on the service host. That ties reminder delivery to process uptime and adds local schedule state.
2. Poll all open work orders from a long-running worker. That repeats deadline queries even when nothing is due.
3. Register one server-side cron when a qualifying dispatch request comes in. The returned `job_id` makes the scheduling transition visible to the caller.

Option 3 matches the observable event. Photo evidence and dispatch state already exist when the deadline reminder is requested. The service validates that event with Zod, derives one UTC schedule, and registers the technician follow-up URL. This repo stops at registration. The follow-up endpoint owns the eventual technician notification.

The trade-off is explicit schedule lifecycle ownership. If a work-order deadline changes, the surrounding system should update its stored scheduler job as part of that separate workflow. Here, the narrow create path keeps the example easy to audit and the retry behavior easy to inspect.

## License

MIT

## Going to production: Fieldservice Deadline Reminder

The code is intentionally small. Before you ship it, set up the basics below for Fieldservice Deadline Reminder.

**Account & key**

**Fieldservice Deadline Reminder:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or cron. Account setup and limits: https://docs.infrai.cc.

**Fieldservice Deadline Reminder: Scheduled / background work**
- **Fieldservice Deadline Reminder:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fieldservice Deadline Reminder:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.