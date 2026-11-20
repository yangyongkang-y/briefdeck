import { describe, expect, it } from "vitest";
import { AI, Repository, platformDownload } from "../src/anna";
import {
  OutlineSchema,
  ProjectSchema,
  SlideSchema,
  groundedSlide,
  fitGeneratedLayout,
  materialSources,
  parseModelJson,
  sampleMaterial,
  sampleProject,
  validateIds,
} from "../src/domain";
import {
  createPresentation,
  layoutSlide,
  layoutWarnings,
  themes,
} from "../src/render";
import JSZip from "jszip";

describe("内容与模型边界", () => {
  it("接受完整样例与六种版式", () => {
    const project = ProjectSchema.parse(sampleProject());
    expect(new Set(project.slides.map((s) => s.layout)).size).toBe(6);
    expect(project.slides).toHaveLength(8);
  });
  it("AI 核心结论页过长时转换为列表，保留全部内容", () => {
    const original = {
      ...sampleProject().slides[1],
      body: ["一", "二", "三", "四"],
    };
    const result = fitGeneratedLayout(original);
    expect(result.layout).toBe("bullets");
    expect(result.body).toEqual(original.body);
    expect(result.id).toBe(original.id);
    expect(layoutWarnings(result, "ocean")).toEqual([]);
  });
  it("给非空材料段落稳定分配引用", () => {
    expect(materialSources("a\n\nb\n c")).toEqual([
      { id: "R1", text: "a" },
      { id: "R2", text: "b" },
      { id: "R3", text: "c" },
    ]);
  });
  it("只清理外层围栏，拒绝破损 JSON", () => {
    expect(
      parseModelJson(
        '```json\n{"slides":[{"id":"s1","title":"标题","purpose":"目的","layout":"cover"}]}\n```',
        OutlineSchema,
      ).slides,
    ).toHaveLength(1);
    expect(() => parseModelJson('{"slides":[', OutlineSchema)).toThrow();
  });
  it("拒绝重复、缺页与错序的页面 ID", () => {
    expect(() => validateIds(["s1", "s1"])).toThrow();
    expect(() => validateIds(["s2", "s1"], ["s1", "s2"])).toThrow();
    expect(() => validateIds(["s1"], ["s1", "s2"])).toThrow();
  });
  it("拒绝长度不匹配或非有限数值的图表", () => {
    const chart = sampleProject().slides[4];
    expect(() =>
      SlideSchema.parse({
        ...chart,
        chart: {
          ...chart.chart,
          labels: ["一个"],
          series: [{ name: "数据", values: [1, 2] }],
        },
      }),
    ).toThrow();
    expect(() =>
      SlideSchema.parse({
        ...chart,
        chart: { ...chart.chart, series: [{ name: "数据", values: [NaN, 2] }] },
      }),
    ).toThrow();
  });
  it("保留有材料依据的图表，降级虚构数值", () => {
    const chart = sampleProject().slides[4];
    expect(groundedSlide(chart, sampleMaterial).layout).toBe("chart");
    expect(
      groundedSlide(
        {
          ...chart,
          chart: {
            ...chart.chart!,
            series: [{ name: "完成率", values: [999, 68] }],
          },
        },
        sampleMaterial,
      ).layout,
    ).toBe("big-point");
    expect(() =>
      groundedSlide({ ...chart, sourceIds: ["R99"] }, sampleMaterial),
    ).toThrow();
  });
  it("截断响应直接失败，不拼接不完整文档", async () => {
    const memory = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k),
        setItem: (k: string, v: string) => memory.set(k, v),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: new EventTarget(),
    });
    const ai = new AI({
      llm: {
        complete: async () => ({
          model: "mock",
          stopReason: "maxTokens",
          content: { text: "{" },
        }),
      },
      storage: { set: async () => ({}) },
    });
    await expect(ai.outline(sampleProject().brief)).rejects.toThrow("截断");
  });
  it("格式修复最多一次，连续错误不会无限使用模型", async () => {
    let calls = 0;
    const ai = new AI({
      llm: {
        complete: async () => {
          calls++;
          return {
            model: "mock",
            stopReason: "endTurn",
            content: { text: "{broken" },
          };
        },
      },
      storage: { set: async () => ({}) },
    });
    await expect(ai.outline(sampleProject().brief)).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it("超过一百行材料合并分组而不丢弃后面的段落", () => {
    const sources = materialSources(
      Array.from({ length: 205 }, (_, i) => `第${i + 1}段`).join("\n"),
    );
    expect(sources.length).toBeLessThanOrEqual(100);
    expect(sources.map((s) => s.text).join("\n")).toContain("第205段");
  });
  it("模型大纲重复内部 ID 时，由应用按页序分配稳定 ID", async () => {
    const project = sampleProject();
    const ai = new AI({
      llm: {
        complete: async () => ({
          model: "mock",
          stopReason: "endTurn",
          content: {
            text: JSON.stringify({
              slides: project.outline.map((slide) => ({ ...slide, id: "s1" })),
            }),
          },
          _meta: { quotaConsumed: 0 },
        }),
      },
      storage: { set: async () => ({}) },
    });
    const outline = await ai.outline(project.brief);
    expect(outline.map((slide) => slide.id)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
    ]);
    expect(outline.map((slide) => slide.title)).toEqual(
      project.outline.map((slide) => slide.title),
    );
  });
});

describe("统一渲染与导出", () => {
  it("默认样例无文字溢出，所有对象处于画布范围内", () => {
    const p = sampleProject();
    for (const theme of Object.keys(themes) as (keyof typeof themes)[]) {
      for (const slide of p.slides) {
        expect(layoutWarnings(slide, theme), slide.title).toEqual([]);
        for (const n of layoutSlide(slide, theme, 0, 8)) {
          expect(n.x).toBeGreaterThanOrEqual(0);
          expect(n.y).toBeGreaterThanOrEqual(0);
          expect(n.x + n.w).toBeLessThanOrEqual(1281);
          expect(n.y + n.h).toBeLessThanOrEqual(721);
        }
      }
    }
  });
  it("长标题给出可见排版警告", () => {
    const p = sampleProject();
    expect(
      layoutWarnings(
        { ...p.slides[0], title: "很长的标题".repeat(20) },
        "ocean",
      ).length,
    ).toBeGreaterThan(0);
  });
  it("PPTX 包含八页可编辑文本、原生图表与讲稿", async () => {
    const p = sampleProject();
    const data = await createPresentation(p).write({
      outputType: "arraybuffer",
      compression: true,
    });
    const zip = await JSZip.loadAsync(data as ArrayBuffer);
    expect(
      Object.keys(zip.files).filter((n) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(n),
      ),
    ).toHaveLength(8);
    expect(
      Object.keys(zip.files).filter((n) =>
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
      ),
    ).toHaveLength(8);
    const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(first).toContain("让第一次体验");
    expect(first).toContain("<p:sp>");
    expect(
      Object.keys(zip.files).some((n) =>
        /^ppt\/charts\/chart\d+\.xml$/.test(n),
      ),
    ).toBe(true);
    const chart = await zip
      .file(
        Object.keys(zip.files).find((n) =>
          /^ppt\/charts\/chart\d+\.xml$/.test(n),
        )!,
      )!
      .async("string");
    expect(chart).toContain("42");
    expect(chart).toContain("68");
    expect(
      Object.keys(zip.files).filter(
        (n) => /^ppt\/media\//.test(n) && !zip.files[n].dir,
      ),
    ).toHaveLength(0);
    const notes = await zip
      .file("ppt/notesSlides/notesSlide1.xml")!
      .async("string");
    expect(notes).toContain("演示数据");
  });
});

describe("APS 快照与并发写入", () => {
  function fakeAPS() {
    const values = new Map<string, { value: unknown; etag: string }>();
    let counter = 0;
    const anna = {
      storage: {
        get: async ({ key }: { key: string }) => ({
          ...values.get(key),
          exists: values.has(key),
        }),
        set: async ({
          key,
          value,
          if_match,
        }: {
          key: string;
          value: unknown;
          if_match?: string;
        }) => {
          if (if_match && values.get(key)?.etag !== if_match)
            throw Object.assign(new Error("conflict"), {
              code: "precondition_failed",
            });
          const etag = String(++counter);
          values.set(key, { value, etag });
          return { etag };
        },
        list: async ({ prefix }: { prefix: string }) => ({
          items: [...values.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((key) => ({ key })),
        }),
        delete: async ({ key }: { key: string }) => values.delete(key),
      },
    };
    return { anna, values };
  }
  it("完整快照写完后再切换指针，重开能恢复", async () => {
    const { anna } = fakeAPS();
    const repo = new Repository(anna);
    const p = sampleProject();
    await repo.save(p);
    expect(await new Repository(anna).load(p.id)).toEqual(p);
  });
  it("同窗口并发保存串行处理，最后一次修订保留", async () => {
    const { anna } = fakeAPS();
    const repo = new Repository(anna);
    const p = sampleProject();
    await Promise.all([
      repo.save(p),
      repo.save({ ...p, title: "第二次修订", revision: 1 }),
    ]);
    expect((await repo.load(p.id))!.title).toBe("第二次修订");
  });
  it("跨窗口冲突不会静默覆盖", async () => {
    const { anna } = fakeAPS();
    const p = sampleProject();
    const one = new Repository(anna),
      two = new Repository(anna);
    await one.save(p);
    await two.load(p.id);
    await one.save({ ...p, revision: 1 });
    await expect(
      two.save({ ...p, revision: 2, title: "过期窗口" }),
    ).rejects.toThrow("conflict");
  });
  it("快照失败后仍可读取上一个完整修订", async () => {
    const { anna } = fakeAPS();
    const repo = new Repository(anna);
    const p = sampleProject();
    await repo.save(p);
    const previous = anna.storage.set;
    anna.storage.set = async (args) => {
      if (args.key.endsWith("/slides")) throw new Error("network");
      return previous(args);
    };
    await expect(
      repo.save({ ...p, revision: 1, title: "失败修订" }),
    ).rejects.toThrow();
    expect((await new Repository(anna).load(p.id))!.title).toBe(p.title);
  });
});

describe("平台文件下载协议", () => {
  it("按初始化、PUT、确认、宿主下载的顺序处理文件", async () => {
    const steps: string[] = [];
    const originalFetch = globalThis.fetch;
    const anna = {
      files: {
        list: async () => ({ items: [] }),
        upload_init: async () => {
          steps.push("init");
          return {
            put_url: "https://storage.example.test/file",
            headers: { "Content-Type": "application/test" },
          };
        },
        upload_finalize: async () => {
          steps.push("finalize");
          return {};
        },
        download: async () => {
          steps.push("download");
          return {};
        },
      },
    };
    globalThis.fetch = async (_url, args) => {
      expect(args?.method).toBe("PUT");
      expect(args?.headers).toEqual({ "Content-Type": "application/test" });
      steps.push("put");
      return new Response("", { status: 200 });
    };
    try {
      await platformDownload(
        anna,
        new Blob(["test"]),
        sampleProject(),
        "demo.pptx",
      );
      expect(steps).toEqual(["init", "put", "finalize", "download"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("PUT 失败时不确认未上传文件，也不触发假下载", async () => {
    let finalized = false;
    const originalFetch = globalThis.fetch;
    const anna = {
      files: {
        list: async () => ({ items: [] }),
        upload_init: async () => ({
          put_url: "https://storage.example.test/file",
          headers: {},
        }),
        upload_finalize: async () => {
          finalized = true;
        },
        download: async () => {
          throw new Error("must not download");
        },
      },
    };
    globalThis.fetch = async () => new Response("", { status: 403 });
    try {
      await expect(
        platformDownload(
          anna,
          new Blob(["test"]),
          sampleProject(),
          "demo.pptx",
        ),
      ).rejects.toThrow("403");
      expect(finalized).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
