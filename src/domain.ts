import { z } from "zod";

export const LAYOUTS = [
  "cover",
  "big-point",
  "bullets",
  "two-column",
  "chart",
  "timeline",
] as const;
export const layoutNames: Record<Layout, string> = {
  cover: "封面",
  "big-point": "核心结论",
  bullets: "要点列表",
  "two-column": "双栏对比",
  chart: "数据图表",
  timeline: "时间线",
};
export type Layout = (typeof LAYOUTS)[number];
export type ThemeId = "ocean" | "paper" | "midnight";

export const ChartSchema = z
  .object({
    type: z.enum(["bar", "line"]),
    labels: z.array(z.string().min(1).max(30)).min(1).max(8),
    series: z
      .array(
        z.object({
          name: z.string().min(1).max(30),
          values: z.array(z.number().finite()).min(1).max(8),
        }),
      )
      .min(1)
      .max(2),
    unit: z.string().max(20),
  })
  .refine(
    (c) => c.series.every((s) => s.values.length === c.labels.length),
    "图表分类与数值数量必须一致",
  );

export const SlideSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    layout: z.enum(LAYOUTS),
    title: z.string().min(1).max(100),
    subtitle: z.string().max(160).default(""),
    body: z.array(z.string().max(160)).max(6),
    notes: z.string().max(1200).default(""),
    sourceIds: z
      .array(z.string().regex(/^R\d+$/))
      .max(30)
      .default([]),
    locked: z.boolean().default(false),
    chart: ChartSchema.optional(),
  })
  .refine((s) => s.layout !== "chart" || !!s.chart, "图表页缺少图表数据");
export type Slide = z.infer<typeof SlideSchema>;
export type ChartData = z.infer<typeof ChartSchema>;

export const BriefSchema = z.object({
  topic: z.string().min(2, "请输入至少两个字符的主题").max(120),
  audience: z.string().min(1).max(80),
  purpose: z.string().min(1).max(80),
  language: z.enum(["zh-CN", "en"]),
  pageCount: z.union([
    z.literal(6),
    z.literal(8),
    z.literal(10),
    z.literal(12),
  ]),
  material: z.string().max(10000),
  theme: z.enum(["ocean", "paper", "midnight"]),
});
export type Brief = z.infer<typeof BriefSchema>;
export const OutlineItemSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(80),
  title: z.string().min(1).max(100),
  purpose: z.string().min(1).max(200),
  layout: z.enum(LAYOUTS),
  sourceIds: z.array(z.string().regex(/^R\d+$/)).default([]),
});
export type OutlineItem = z.infer<typeof OutlineItemSchema>;
export const OutlineSchema = z.object({
  slides: z.array(OutlineItemSchema).min(1).max(12),
});
export const BatchSchema = z.object({
  slides: z.array(SlideSchema).min(1).max(3),
});
export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    title: z.string().max(120),
    brief: BriefSchema,
    outline: z.array(OutlineItemSchema).max(12),
    slides: z.array(SlideSchema).max(12),
    updatedAt: z.string(),
    createdAt: z.string(),
    status: z.enum(["outline", "generating", "ready", "partial"]),
    demo: z.boolean().default(false),
  })
  .refine(
    (p) => new Set(p.slides.map((s) => s.id)).size === p.slides.length,
    "页面 ID 重复",
  );
export type Project = z.infer<typeof ProjectSchema>;

export const defaultBrief: Brief = {
  topic: "",
  audience: "团队与主管",
  purpose: "项目提案",
  language: "zh-CN",
  pageCount: 8,
  material: "",
  theme: "ocean",
};
export function id() {
  return crypto.randomUUID();
}
export function newProject(brief: Brief, outline: OutlineItem[]): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: id(),
    revision: 0,
    title: brief.topic,
    brief,
    outline,
    slides: [],
    status: "outline",
    createdAt: now,
    updatedAt: now,
    demo: false,
  };
}
export function revise(p: Project, patch: Partial<Project>): Project {
  return {
    ...p,
    ...patch,
    revision: p.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}
export function materialSources(material: string) {
  const lines = material
    .split(/\n\s*\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const groupSize = Math.max(1, Math.ceil(lines.length / 100));
  const paragraphs: string[] = [];
  for (let i = 0; i < lines.length; i += groupSize)
    paragraphs.push(lines.slice(i, i + groupSize).join("\n"));
  return paragraphs.map((text, i) => ({ id: `R${i + 1}`, text }));
}
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return schema.parse(JSON.parse(trimmed));
}
export function validateIds(ids: string[], expected?: string[]) {
  if (new Set(ids).size !== ids.length)
    throw new Error("AI 返回了重复页面 ID，请重试本批。");
  if (
    expected &&
    (ids.length !== expected.length || ids.some((s, i) => s !== expected[i]))
  )
    throw new Error("AI 返回的页面与当前大纲不匹配，请重试本批。");
}
export function validateSources(ids: string[], material: string) {
  const allowed = new Set(materialSources(material).map((s) => s.id));
  if (ids.some((s) => !allowed.has(s)))
    throw new Error("生成内容引用了不存在的材料段落。");
}
export function fitGeneratedLayout(slide: Slide): Slide {
  if (
    (slide.layout === "big-point" && slide.body.length > 3) ||
    (slide.layout === "timeline" && slide.body.length > 5)
  ) {
    return { ...slide, layout: "bullets" };
  }
  return slide;
}
export function groundedSlide(slide: Slide, material: string): Slide {
  slide = fitGeneratedLayout(slide);
  validateSources(slide.sourceIds, material);
  if (!slide.chart) return slide;
  const cited = materialSources(material)
    .filter((s) => slide.sourceIds.includes(s.id))
    .map((s) => s.text)
    .join("\n");
  const nums = new Set(
    (cited.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
  );
  if (
    !cited ||
    slide.chart.series.some((s) => s.values.some((v) => !nums.has(v)))
  ) {
    return {
      ...slide,
      layout: "big-point",
      chart: undefined,
      subtitle: "数据待核实",
      body: ["请补充并核对原始数据后，在右侧编辑器中设置图表。"],
      notes: `${slide.notes}\n本页未使用无法从引用材料核对的图表数值。`,
    };
  }
  return slide;
}
export function blankSlide(): Slide {
  return {
    id: `s-${id()}`,
    layout: "bullets",
    title: "新的一页",
    subtitle: "",
    body: ["在这里写下你的核心观点"],
    notes: "",
    sourceIds: [],
    locked: false,
  };
}

export const sampleMaterial =
  "项目目标：改善新用户首次使用体验。\n当前问题：引导步骤分散、缺少清晰的下一步提示、核心价值展示过晚。\n改版方向：将引导缩减为三个阶段，先体验核心功能，再完善个人信息。\n演示数据：旧流程完成率为 42%，新流程试点完成率为 68%。这些数值仅用于演示，不代表真实业务。\n实施计划：第一周验证需求，第二周完成原型，第三周试点，第四周评估。";
export function sampleProject(): Project {
  const brief: Brief = {
    ...defaultBrief,
    topic: "让第一次体验，成为留下的理由",
    material: sampleMaterial,
  };
  const base = (
    layout: Layout,
    title: string,
    body: string[],
    subtitle = "",
  ): Slide => ({
    id: `s${Math.random().toString(36).slice(2, 10)}`,
    layout,
    title,
    body,
    subtitle,
    sourceIds: [],
    notes:
      "这是一个可自由编辑的演示项目。所有数据均为演示数据，正式汇报前请替换为已核实的业务材料。",
    locked: false,
  });
  const slides: Slide[] = [
    base(
      "cover",
      "让第一次体验，\n成为留下的理由",
      ["新用户引导体验升级提案"],
      "PRODUCT EXPERIENCE · 2026",
    ),
    base(
      "big-point",
      "先让用户感受到价值",
      [
        "把第一次成功体验，放在信息填写之前。",
        "围绕一个清晰目标，重新组织新用户的旅程。",
      ],
      "核心判断",
    ),
    base(
      "bullets",
      "三个阻力，打断了体验",
      [
        "路径分散：用户不知道应该从哪里开始",
        "指引不足：完成一步后缺少下一步提示",
        "价值滞后：尚未体验功能就被要求填写信息",
      ],
      "从用户的第一分钟出发",
    ),
    base(
      "two-column",
      "从完成流程，到创造体验",
      [
        "现状｜先填写信息，再寻找功能",
        "现状｜多个入口，缺少顺序",
        "目标｜先体验核心功能，再完善信息",
        "目标｜一条路径，一个明确的下一步",
      ],
      "重新定义引导的成功标准",
    ),
    {
      ...base(
        "chart",
        "更短的路径，更高的完成率",
        ["演示数据 · 正式汇报前请替换并核实"],
        "试点观察",
      ),
      chart: {
        type: "bar",
        labels: ["旧流程", "新流程试点"],
        series: [{ name: "完成率", values: [42, 68] }],
        unit: "%",
      },
      sourceIds: ["R4"],
    },
    base(
      "timeline",
      "四周，把方向变成结果",
      [
        "需求验证｜梳理关键阻力与成功标准",
        "原型设计｜让下一步始终清晰",
        "小范围试点｜观察行为与反馈",
        "效果评估｜根据证据决定下一步",
      ],
      "小步验证，持续学习",
    ),
    base(
      "bullets",
      "让每一步都有明确负责人",
      [
        "产品：定义关键路径与验收标准",
        "设计：完成原型与关键状态",
        "研发：分阶段交付并记录行为",
        "运营：收集反馈，跟进试点体验",
      ],
      "协作与执行",
    ),
    base(
      "big-point",
      "从一个更好的开始出发",
      [
        "本次需要确认：改版方向与试点范围",
        "下一步：共同评审原型，启动小范围验证",
      ],
      "让用户更快抵达第一次成功",
    ),
  ];
  return {
    ...newProject(
      brief,
      slides.map((s) => ({
        id: s.id,
        title: s.title,
        purpose: s.subtitle || s.title,
        layout: s.layout,
        sourceIds: s.sourceIds,
      })),
    ),
    slides,
    status: "ready",
    demo: true,
  };
}
