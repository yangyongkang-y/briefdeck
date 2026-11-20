import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHarnessClient } from "./harness-client.mjs";

if (!process.argv.includes("--run"))
  throw new Error("Pass --run to authorize metered Anna regression calls.");
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v),
};
globalThis.window = new EventTarget();
const { anna, rpc } = await createHarnessClient();
const server = await createServer({ server: { middlewareMode: true } });
const report = { at: new Date().toISOString(), cases: [] };
mkdirSync(".local", { recursive: true });
try {
  const { AI, Repository, readUsage } =
    await server.ssrLoadModule("/src/anna.ts");
  const { defaultBrief, newProject, materialSources } =
    await server.ssrLoadModule("/src/domain.ts");
  const { createPresentation, layoutWarnings } =
    await server.ssrLoadModule("/src/render.tsx");
  report.quotaBefore = (await rpc("llm", "catalog")).quota;
  const cases = [
    {
      name: "english-chart",
      brief: {
        ...defaultBrief,
        topic:
          "Onboarding proposal: show a bar chart comparing the supplied completion rates",
        language: "en",
        pageCount: 6,
        material:
          "Background: new users struggle to find the core feature.\nGoal: let users experience product value before completing profile information.\nIllustrative dataset only: Legacy completion rate 42%; Pilot completion rate 68%. These are demo figures, not actual business statistics.\nPlan: week one research, week two prototype, week three pilot, week four evaluation.\nDecision requested: approve the direction and pilot scope.",
      },
    },
    {
      name: "max12",
      brief: {
        ...defaultBrief,
        topic: "客户支持知识库升级：问题、方案与实施计划",
        pageCount: 12,
        material:
          "背景：支持团队需要整理分散的知识材料。目标是帮助成员快速找到一致的回答。当前痛点包括入口分散、内容过期、缺少负责人与复核流程。建议按主题组织条目，建立负责人制度，先在小范围试点，再根据反馈调整。验收关注内容可找到、回答有依据、更新有人负责，不编造任何业务收益或用户规模。\n"
            .repeat(80)
            .slice(0, 10000),
      },
    },
  ];
  for (const item of cases) {
    memory.clear();
    const ai = new AI(anna);
    ai.beginOperation();
    const outline = await ai.outline(item.brief);
    if (
      item.name === "english-chart" &&
      !outline.some((o) => o.layout === "chart")
    ) {
      const source = materialSources(item.brief.material).find((s) =>
        s.text.includes("42%"),
      );
      outline[3] = {
        ...outline[3],
        layout: "chart",
        title: "Pilot completion is higher in the illustrative dataset",
        purpose:
          "Create a native bar chart: Legacy 42%, Pilot 68%; clearly label this as illustrative data.",
        sourceIds: [source.id],
      };
    }
    let project = newProject(item.brief, outline);
    for (let i = 0; i < outline.length; i += 3) {
      const slides = await ai.batch(project, outline.slice(i, i + 3));
      project = {
        ...project,
        slides: [...project.slides, ...slides],
        revision: project.revision + 1,
        status: "partial",
      };
      writeFileSync(
        `.local/${item.name}-partial.json`,
        JSON.stringify(project, null, 2),
      );
      console.log(
        JSON.stringify({
          scenario: item.name,
          completed: project.slides.length,
        }),
      );
      const quota = (await rpc("llm", "catalog")).quota;
      if (report.quotaBefore.remainingCU - quota.remainingCU > 100)
        throw new Error(
          "Regression budget exceeded 100 CU; stopping further model calls.",
        );
    }
    project.status = "ready";
    assert.equal(project.slides.length, item.brief.pageCount);
    if (item.name === "english-chart") {
      assert.ok(
        project.slides.some((s) => s.layout === "chart" && s.chart),
        "No grounded chart was produced",
      );
      assert.ok(
        project.slides.filter((s) => /[A-Za-z]/.test(s.title)).length >= 4,
        "English language check failed",
      );
    }
    const repository = new Repository(anna);
    await repository.save(project);
    assert.deepEqual(await new Repository(anna).load(project.id), project);
    const warnings = project.slides.flatMap((s, i) =>
      layoutWarnings(s, project.brief.theme).map((w) => ({
        page: i + 1,
        warning: w,
      })),
    );
    const bytes = await createPresentation(project).write({
      outputType: "nodebuffer",
      compression: true,
    });
    writeFileSync(`examples/BriefDeck-Anna-${item.name}.pptx`, bytes);
    writeFileSync(
      `examples/BriefDeck-Anna-${item.name}.json`,
      JSON.stringify(project, null, 2),
    );
    const usage = readUsage();
    const entry = {
      name: item.name,
      pages: project.slides.length,
      inputCharacters: item.brief.material.length,
      warnings,
      usage,
      actualCU: usage.reduce((s, u) => s + (u.cu ?? 0), 0),
      unknownCosts: usage.filter((u) => u.cu === null).length,
      nativeCharts: project.slides.filter((s) => s.chart).length,
    };
    report.cases.push(entry);
    writeFileSync(
      ".local/anna-regression.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        scenario: item.name,
        pages: entry.pages,
        actualCU: entry.actualCU,
        warnings,
        nativeCharts: entry.nativeCharts,
      }),
    );
  }
  report.quotaAfter = (await rpc("llm", "catalog")).quota;
  writeFileSync(".local/anna-regression.json", JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error.message).replace(
    /eyJ[A-Za-z0-9_.-]+/g,
    "[token]",
  );
  report.pendingUsage = JSON.parse(memory.get("briefdeck:usage:v1") || "[]");
  writeFileSync(
    ".local/anna-regression-failure.json",
    JSON.stringify(report, null, 2),
  );
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await server.close();
}
