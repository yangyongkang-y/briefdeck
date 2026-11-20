import { createServer } from "vite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Run only against the official, authenticated local Anna CLI harness.
// No password or PAT is read by this script. Sessions and signed URLs stay in memory.
const base = process.env.BRIEFDECK_HARNESS || "http://localhost:5181";
const generate = process.argv.includes("--generate");
const resume = process.argv.includes("--resume");
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
globalThis.window = new EventTarget();
const report = {
  at: new Date().toISOString(),
  mode: generate ? "real-generation" : "capability-probe",
  checks: {},
};
mkdirSync(".local", { recursive: true });

async function request(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok)
    throw new Error(
      `${path}: HTTP ${res.status}: ${(await res.text()).slice(0, 1000)}`,
    );
  return res.json();
}
const session = await request("/api/session/create", {});
async function rpc(ns, method, args = {}) {
  const out = await request("/api/session/call", {
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
const server = await createServer({ server: { middlewareMode: true } });
try {
  const catalog = await rpc("llm", "catalog");
  report.quotaBefore = catalog.quota ?? null;
  report.checks.catalog = true;
  console.log(
    JSON.stringify({
      phase: "catalog",
      quota: report.quotaBefore,
      modelCount: catalog.models?.length ?? null,
    }),
  );
  const probeId = crypto.randomUUID();
  const key = `smoke/${probeId}`;
  await rpc("storage", "set", {
    key,
    value: { test: "BriefDeck APS roundtrip", at: report.at },
    ttl_seconds: 600,
  });
  const read = await rpc("storage", "get", { key });
  assert.equal(read.value.test, "BriefDeck APS roundtrip");
  await rpc("storage", "delete", { key });
  report.checks.storageRoundtrip = true;

  const bytes = new TextEncoder().encode("BriefDeck staging file roundtrip\n");
  const path = `smoke/${probeId}.txt`;
  const init = await rpc("files", "upload_init", {
    path,
    content_type: "text/plain",
    size: bytes.byteLength,
  });
  report.uploadOrigin = new URL(init.put_url).origin;
  const put = await fetch(init.put_url, {
    method: "PUT",
    headers: init.headers,
    body: bytes,
  });
  assert.equal(put.ok, true, `Object upload: HTTP ${put.status}`);
  await rpc("files", "upload_finalize", { path, size: bytes.byteLength });
  const download = await rpc("files", "download_url", { path });
  const get = await fetch(download.get_url);
  assert.equal(await get.text(), new TextDecoder().decode(bytes));
  await rpc("files", "delete", { path });
  report.checks.fileRoundtrip = true;
  console.log(
    JSON.stringify({
      phase: "probe",
      checks: report.checks,
      uploadOrigin: report.uploadOrigin,
    }),
  );

  if (generate) {
    const { AI, Repository, readUsage, platformDownload } =
      await server.ssrLoadModule("/src/anna.ts");
    const { newProject, defaultBrief, ProjectSchema } =
      await server.ssrLoadModule("/src/domain.ts");
    const { createPresentation, layoutWarnings } =
      await server.ssrLoadModule("/src/render.tsx");
    const ai = new AI(anna);
    const brief = {
      ...defaultBrief,
      topic: "新用户引导改版提案：先体验价值，再完善信息",
      audience: "团队与主管",
      material:
        "项目背景：新用户在首次使用时难以找到核心功能。\n当前问题：入口分散、缺少下一步提示，核心价值展示较晚。\n改版方向：先体验核心功能，再完善个人信息。\n本次使用演示数据，旧流程完成率42%，试点完成率68%，这些不是实际业务统计。\n四周计划：第一周验证需求，第二周完成原型，第三周小范围试点，第四周评估。\n希望主管确认改版方向和试点范围。",
    };
    ai.beginOperation();
    let project;
    if (resume && existsSync(".local/anna-real-project.json")) {
      project = ProjectSchema.parse(
        JSON.parse(readFileSync(".local/anna-real-project.json", "utf8")),
      );
      console.log(
        JSON.stringify({ phase: "resume", completed: project.slides.length }),
      );
    } else {
      const outline = await ai.outline(brief);
      console.log(JSON.stringify({ phase: "outline", pages: outline.length }));
      project = newProject(brief, outline);
      writeFileSync(
        ".local/anna-real-project.json",
        JSON.stringify(project, null, 2),
      );
    }
    async function checkBudget() {
      const balance = await rpc("llm", "catalog");
      const spent =
        report.quotaBefore?.remainingCU - balance.quota?.remainingCU;
      report.quotaAfter = balance.quota;
      if (spent > 300)
        throw new Error(
          `本次实测已使用 ${spent} CU，暂停并复核预算，不再自动调用模型。`,
        );
    }
    await checkBudget();
    const missing = project.outline.filter(
      (o) => !project.slides.some((s) => s.id === o.id),
    );
    for (let i = 0; i < missing.length; i += 3) {
      const slides = await ai.batch(project, missing.slice(i, i + 3));
      project = {
        ...project,
        slides: [...project.slides, ...slides],
        revision: project.revision + 1,
        status: "partial",
      };
      writeFileSync(
        ".local/anna-real-project.json",
        JSON.stringify(project, null, 2),
      );
      console.log(
        JSON.stringify({
          phase: "slides",
          completed: project.slides.length,
          total: project.outline.length,
        }),
      );
      await checkBudget();
    }
    project.status = "ready";
    const repository = new Repository(anna);
    await repository.save(project);
    const restored = await new Repository(anna).load(project.id);
    assert.deepEqual(restored, project);
    report.checks.projectRestore = true;
    const beforeChart = JSON.stringify(project.slides[0].chart);
    const rewritten = await ai.rewrite(
      project,
      project.slides[0],
      "精简标题与正文，突出需要主管做的决策；保留事实和数值。",
    );
    await checkBudget();
    assert.equal(JSON.stringify(rewritten.chart), beforeChart);
    report.checks.singleSlideRewrite = true;
    report.projectId = project.id;
    report.pages = project.slides.length;
    report.layoutWarnings = project.slides.flatMap((slide, i) =>
      layoutWarnings(slide, project.brief.theme).map((w) => ({
        page: i + 1,
        warning: w,
      })),
    );
    const blob = await createPresentation(project).write({
      outputType: "blob",
      compression: true,
    });
    await platformDownload(anna, blob, project, "BriefDeck-Anna-real.pptx");
    report.checks.pptxUploadedAndPresigned = true;
    // The CLI bridge verifies backend download/presign; a real platform browser
    // must separately verify that the host opens its download dialog.
    mkdirSync("examples", { recursive: true });
    writeFileSync(
      "examples/BriefDeck-Anna-real.pptx",
      Buffer.from(await blob.arrayBuffer()),
    );
    writeFileSync(
      "examples/BriefDeck-Anna-real.json",
      JSON.stringify(project, null, 2),
    );
    report.usage = readUsage();
    report.actualCU = report.usage.reduce((sum, row) => sum + (row.cu ?? 0), 0);
    report.unknownCosts = report.usage.filter((row) => row.cu === null).length;
    console.log(
      JSON.stringify({
        phase: "generation-complete",
        pages: report.pages,
        actualCU: report.actualCU,
        checks: report.checks,
        layoutWarnings: report.layoutWarnings,
      }),
    );
  }
  const after = await rpc("llm", "catalog");
  report.quotaAfter = after.quota ?? null;
  writeFileSync(
    `.local/anna-${generate ? "real-test" : "probe"}.json`,
    JSON.stringify(report, null, 2),
  );
} catch (error) {
  const message = String(error.message)
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[token]")
    .replace(/(https:\/\/[^\s?]+)\?[^\s]+/g, "$1?[redacted]");
  report.error = message;
  report.usage = JSON.parse(store.get("briefdeck:usage:v1") || "[]");
  writeFileSync(
    `.local/anna-${generate ? "real-test" : "probe"}-failure.json`,
    JSON.stringify(report, null, 2),
  );
  console.error(
    JSON.stringify({ error: message, code: error.code, checks: report.checks }),
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
