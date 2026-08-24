import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { requireAuthenticatedUser } from "../src/api/auth.js";
import { getBillingSummary } from "../src/api/billing.js";
import { getProfile } from "../src/api/profile.js";
import { renderAccountSummary } from "../src/ui/account-summary.js";

NodeTest.test("authentication remains fail-closed", () => {
  NodeAssert.deepEqual(requireAuthenticatedUser(null), {
    status: 401,
    body: { error: "unauthorized" },
  });
  NodeAssert.deepEqual(requireAuthenticatedUser({ userId: "user-1" }), {
    status: 200,
    userId: "user-1",
  });
});

NodeTest.test("billing remains a protected stable contract", () => {
  NodeAssert.deepEqual(getBillingSummary("user-1"), {
    userId: "user-1",
    plan: "starter",
    canManageBilling: false,
  });
});

NodeTest.test("the existing account surface composes authenticated profile and billing", () => {
  const profile = getProfile({ userId: "user-1" });
  NodeAssert.equal(profile.status, 200);
  NodeAssert.equal(
    renderAccountSummary(profile.body, getBillingSummary("user-1")),
    "Alpha User · starter",
  );
});
