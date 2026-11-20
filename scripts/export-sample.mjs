import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { sampleProject } = await server.ssrLoadModule("/src/domain.ts");
  const { createPresentation } = await server.ssrLoadModule("/src/render.tsx");
  const project = sampleProject();
  mkdirSync("examples", { recursive: true });
  writeFileSync(
    "examples/BriefDeck-demo.pptx",
    await createPresentation(project).write({
      outputType: "nodebuffer",
      compression: true,
    }),
  );
  writeFileSync(
    "examples/BriefDeck-demo.json",
    JSON.stringify(project, null, 2) + "\n",
  );
  console.log(
    "Exported editable 8-page demo; all data is illustrative, not AI-generated.",
  );
} finally {
  await server.close();
}
