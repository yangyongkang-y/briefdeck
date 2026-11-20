import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { createHarnessClient } from "./harness-client.mjs";
import assert from "node:assert/strict";

const { anna } = await createHarnessClient();
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { fitGeneratedLayout, ProjectSchema } =
    await server.ssrLoadModule("/src/domain.ts");
  const { createPresentation, layoutWarnings } =
    await server.ssrLoadModule("/src/render.tsx");
  const { Repository, platformDownload } =
    await server.ssrLoadModule("/src/anna.ts");
  const project = ProjectSchema.parse(
    JSON.parse(readFileSync("examples/BriefDeck-Anna-real.json", "utf8")),
  );
  const adjusted = [];
  project.slides = project.slides.map((slide, i) => {
    const normalized = fitGeneratedLayout(slide);
    if (normalized.layout !== slide.layout)
      adjusted.push({ page: i + 1, from: slide.layout, to: normalized.layout });
    assert.deepEqual(normalized.body, slide.body);
    return normalized;
  });
  project.revision++;
  const repo = new Repository(anna);
  await repo.load(project.id);
  await repo.save(project);
  assert.deepEqual(await new Repository(anna).load(project.id), project);
  const blob = await createPresentation(project).write({
    outputType: "blob",
    compression: true,
  });
  await platformDownload(anna, blob, project, "BriefDeck-Anna-real.pptx");
  writeFileSync(
    "examples/BriefDeck-Anna-real.json",
    JSON.stringify(project, null, 2),
  );
  writeFileSync(
    "examples/BriefDeck-Anna-real.pptx",
    Buffer.from(await blob.arrayBuffer()),
  );
  const report = JSON.parse(readFileSync(".local/anna-real-test.json", "utf8"));
  report.originalLayoutWarnings = report.layoutWarnings;
  report.layoutWarnings = project.slides.flatMap((slide, i) =>
    layoutWarnings(slide, project.brief.theme).map((w) => ({
      page: i + 1,
      warning: w,
    })),
  );
  report.layoutAdjustments = adjusted;
  writeFileSync(".local/anna-real-test.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      adjusted,
      warnings: report.layoutWarnings,
      additionalAICalls: 0,
    }),
  );
} finally {
  await server.close();
}
