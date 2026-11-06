import { createHash } from "node:crypto";
import { z } from "zod";

export const reminderRequestSchema = z.object({
  workOrderId: z.string().min(1),
  dispatchStatus: z.enum(["unassigned", "dispatched", "completed"]),
  photoUrls: z.array(z.string().url()),
  technician: z.object({
    id: z.string().min(1),
    followUpUrl: z.string().url(),
  }),
  deadlineAt: z.string().datetime({ offset: true }),
  remindAt: z.string().datetime({ offset: true }),
});

export type ReminderRequest = z.infer<typeof reminderRequestSchema>;

export class ReminderDecisionError extends Error {
  public readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "ReminderDecisionError";
    this.reason = reason;
  }
}

export type ReminderPlan = {
  cronExpr: string;
  task: string;
  idempotencyKey: string;
};

export function planDeadlineReminder(input: ReminderRequest): ReminderPlan {
  if (input.dispatchStatus !== "dispatched") {
    throw new ReminderDecisionError("work order must be dispatched");
  }
  if (input.photoUrls.length === 0) {
    throw new ReminderDecisionError("at least one work-order photo is required");
  }

  const remindAt = new Date(input.remindAt);
  const deadlineAt = new Date(input.deadlineAt);
  if (remindAt >= deadlineAt) {
    throw new ReminderDecisionError("reminder must precede the deadline");
  }

  const cronExpr = [
    remindAt.getUTCMinutes(),
    remindAt.getUTCHours(),
    remindAt.getUTCDate(),
    remindAt.getUTCMonth() + 1,
    "*",
  ].join(" ");

  const task = new URL(input.technician.followUpUrl);
  task.searchParams.set("workOrderId", input.workOrderId);
  task.searchParams.set("technicianId", input.technician.id);

  const digest = createHash("sha256")
    .update(`${input.workOrderId}:${input.remindAt}`)
    .digest("hex")
    .slice(0, 24);

  return {
    cronExpr,
    task: task.toString(),
    idempotencyKey: `fieldservice-reminder-${digest}`,
  };
}
