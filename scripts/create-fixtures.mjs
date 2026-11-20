import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("fixtures", { recursive: true });
const titles = [
  "让第一次体验，成为留下的理由",
  "先让用户感受到价值",
  "三个阻力，打断了体验",
  "从完成流程，到创造体验",
  "用证据评估改版效果",
  "四周，把方向变成结果",
  "让每一步都有明确负责人",
  "从一个更好的开始出发",
];
const layouts = [
  "cover",
  "big-point",
  "bullets",
  "two-column",
  "bullets",
  "timeline",
  "bullets",
  "big-point",
];
const slides = titles.map((title, i) => ({
  id: `s${i + 1}`,
  layout: layouts[i],
  title,
  subtitle: "本地固定样例 · 不代表 AI 生成",
  body:
    layouts[i] === "timeline"
      ? [
          "需求验证｜确认目标",
          "原型设计｜梳理路径",
          "小范围试点｜收集反馈",
          "效果评估｜明确下一步",
        ]
      : ["明确本页的核心观点", "结合材料说明判断依据", "给出清晰的下一步行动"],
  notes: "这是固定的离线测试样例，正式汇报前请替换为已核实的项目材料。",
  sourceIds: [],
  locked: false,
}));
const outline = {
  slides: slides.map((s) => ({
    id: s.id,
    title: s.title,
    layout: s.layout,
    purpose: "说明问题并提出下一步行动",
    sourceIds: [],
  })),
};
const reply = (data) => ({
  role: "assistant",
  content: { type: "text", text: JSON.stringify(data) },
  model: "offline-fixture",
  stopReason: "endTurn",
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  _meta: { quotaConsumed: 0 },
});
const fixtures = [
  {
    ns: "llm",
    method: "complete",
    match: { contentIncludes: '"pageCount":8' },
    result: reply(outline),
  },
];
for (let i = 0; i < slides.length; i += 3)
  fixtures.push({
    ns: "llm",
    method: "complete",
    match: { contentIncludes: `"batch":[{"id":"s${i + 1}"` },
    result: reply({ slides: slides.slice(i, i + 3) }),
  });
fixtures.push({
  ns: "llm",
  method: "complete",
  match: { contentIncludes: '"instruction":' },
  result: reply({ ...slides[0], title: "用更清晰的观点，开始这次汇报" }),
});
writeFileSync(
  "fixtures/replies.jsonl",
  fixtures.map((v) => JSON.stringify(v)).join("\n") + "\n",
);
writeFileSync(
  "fixtures/deck.json",
  JSON.stringify({ outline: outline.slides, slides }, null, 2) + "\n",
);
console.log("Wrote offline fixtures (8 pages).");
