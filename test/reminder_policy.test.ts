import assert from "node:assert/strict";
import test from "node:test";
import { planDeadlineReminder, reminderRequestSchema } from "../src/reminder_policy.js";

test("a dispatched work order with photo evidence gets a UTC reminder plan", () => {
  const input = reminderRequestSchema.parse({
    workOrderId: "WO-1842",
    dispatchStatus: "dispatched",
    photoUrls: ["https://media.example.test/work-orders/WO-1842/panel.jpg"],
    technician: {
      id: "tech-17",
      followUpUrl: "https://dispatch.example.test/deadline-follow-up",
    },
    deadlineAt: "2026-11-08T18:00:00-05:00",
    remindAt: "2026-11-08T15:30:00-05:00",
  });

  const plan = planDeadlineReminder(input);

  assert.equal(plan.cronExpr, "30 20 8 11 *");
  assert.equal(
    plan.task,
    "https://dispatch.example.test/deadline-follow-up?workOrderId=WO-1842&technicianId=tech-17",
  );
  assert.match(plan.idempotencyKey, /^fieldservice-reminder-[a-f0-9]{24}$/);
});

test("a work order without a photo is not scheduled", () => {
  const input = reminderRequestSchema.parse({
    workOrderId: "WO-1843",
    dispatchStatus: "dispatched",
    photoUrls: [],
    technician: {
      id: "tech-18",
      followUpUrl: "https://dispatch.example.test/deadline-follow-up",
    },
    deadlineAt: "2026-11-08T18:00:00Z",
    remindAt: "2026-11-08T15:30:00Z",
  });

  assert.throws(() => planDeadlineReminder(input), /photo/);
});
