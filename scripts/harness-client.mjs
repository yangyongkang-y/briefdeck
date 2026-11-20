export async function createHarnessClient(base = "http://localhost:5181") {
  async function post(path, body) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok)
      throw new Error(`Harness ${path}: HTTP ${response.status}`);
    return response.json();
  }
  const session = await post("/api/session/create", {});
  async function rpc(ns, method, args = {}) {
    const out = await post("/api/session/call", {
      session_id: session.session_id,
      ns,
      method,
      args,
    });
    if (out.ok === false || out.error)
      throw Object.assign(
        new Error(out.error?.message || `${ns}.${method} failed`),
        { code: out.error?.code },
      );
    return out.result ?? out;
  }
  const anna = Object.fromEntries(
    ["llm", "storage", "files"].map((ns) => [
      ns,
      new Proxy({}, { get: (_, method) => (args) => rpc(ns, method, args) }),
    ]),
  );
  return { anna, rpc };
}
