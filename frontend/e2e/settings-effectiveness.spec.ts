import { expect, request as playwrightRequest, test } from "@playwright/test";

test("saved verification is emitted in website HTML and clearing removes it without rebuilding", async ({ request }) => {
  const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
  if (!["127.0.0.1", "localhost"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const admin = await playwrightRequest.newContext({ baseURL: adminBase });
  let original: string | undefined;
  try {
    const login = await admin.post("/api/v1/admin/login", { data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Songdian@2026" } });
    expect((await login.json()).code).toBe("0");
    const settings = await (await admin.get("/api/v1/admin/settings")).json();
    original = settings.data.google_verification.value;
    const value = `verification-fixture-${Date.now()}`;
    expect((await (await admin.put("/api/v1/admin/settings", { data: { google_verification: value } })).json()).code).toBe("0");
    await expect.poll(async () => (await request.get("/")).text()).toContain(`content="${value}"`);
    expect((await (await admin.put("/api/v1/admin/settings/google_verification", { data: { value: "" } })).json()).code).toBe("0");
    await expect.poll(async () => (await request.get("/")).text()).not.toContain('name="google-site-verification"');
  } finally {
    if (original !== undefined) await admin.put("/api/v1/admin/settings", { data: { google_verification: original } });
    await admin.dispose();
  }
});
