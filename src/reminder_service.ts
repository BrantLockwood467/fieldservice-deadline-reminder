import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, infrai } from "./infrai_cron.js";
import {
  ReminderDecisionError,
  planDeadlineReminder,
  reminderRequestSchema,
} from "./reminder_policy.js";

const PORT = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/reminders") {
    send(response, 404, { error: "route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = reminderRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const plan = planDeadlineReminder(input);
    const job = await infrai.cron.create(
      { cron_expr: plan.cronExpr, task: plan.task },
      plan.idempotencyKey,
    );

    send(response, 201, {
      workOrderId: input.workOrderId,
      reminder: { jobId: job.job_id, scheduledFor: input.remindAt },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      send(response, 400, { error: "invalid request body" });
    } else if (error instanceof ReminderDecisionError) {
      send(response, 422, { error: error.reason });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message, code: error.code });
    } else {
      send(response, 502, { error: "reminder scheduling failed" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`reminder service listening on http://localhost:${PORT}`);
});
