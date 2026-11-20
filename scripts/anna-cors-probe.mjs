import { createHarnessClient } from "./harness-client.mjs";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { rpc } = await createHarnessClient();
const path = `smoke/cors-${crypto.randomUUID()}.txt`;
const bytes = new TextEncoder().encode("BriefDeck browser upload CORS probe");
const init = await rpc("files", "upload_init", {
  path,
  content_type: "text/plain",
  size: bytes.byteLength,
});
const preflight = await fetch(init.put_url, {
  method: "OPTIONS",
  headers: {
    Origin: "https://staging.anna.partners",
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": Object.keys(init.headers).join(", "),
  },
});
const report = {
  at: new Date().toISOString(),
  status: preflight.status,
  allowOrigin: preflight.headers.get("access-control-allow-origin"),
  allowMethods: preflight.headers.get("access-control-allow-methods"),
  allowHeaders: preflight.headers.get("access-control-allow-headers"),
};
assert.ok(preflight.ok);
assert.ok(["*", "https://staging.anna.partners"].includes(report.allowOrigin));
assert.ok(report.allowMethods.includes("PUT"));
const put = await fetch(init.put_url, {
  method: "PUT",
  headers: { ...init.headers, Origin: "https://staging.anna.partners" },
  body: bytes,
});
assert.ok(put.ok);
report.putStatus = put.status;
report.putAllowOrigin = put.headers.get("access-control-allow-origin");
await rpc("files", "upload_finalize", { path, size: bytes.byteLength });
await rpc("files", "delete", { path });
writeFileSync(".local/anna-cors-probe.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
