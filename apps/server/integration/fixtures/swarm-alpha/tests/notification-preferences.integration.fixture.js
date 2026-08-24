import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

NodeTest.test("notification preferences flow from shared defaults through API and UI", async () => {
  const shared = await import("../src/shared/notification-preferences.js");
  const api = await import("../src/api/notification-preferences.js");
  const ui = await import("../src/ui/notification-preferences.js");

  const defaults = shared.defaultNotificationPreferences();
  const response = api.updateNotificationPreferences(
    { userId: "user-1" },
    { ...defaults, productUpdates: false },
  );

  NodeAssert.equal(response.status, 200);
  NodeAssert.deepEqual(response.body.preferences, {
    accountActivity: true,
    productUpdates: false,
  });
  NodeAssert.equal(
    ui.renderNotificationPreferences(response.body.preferences),
    "Account activity: on · Product updates: off",
  );
});
