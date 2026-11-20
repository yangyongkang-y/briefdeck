import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MoreHorizontal,
  Palette,
  PanelRightClose,
  Play,
  Plus,
  Presentation,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  AI,
  Anna,
  Repository,
  Usage,
  connectAnna,
  friendlyError,
  localDownload,
  platformDownload,
  readUsage,
} from "./anna";
import {
  Brief,
  BriefSchema,
  ChartData,
  LAYOUTS,
  Layout,
  OutlineItem,
  Project,
  ProjectSchema,
  Slide,
  ThemeId,
  blankSlide,
  defaultBrief,
  id,
  layoutNames,
  materialSources,
  newProject,
  revise,
  sampleMaterial,
  sampleProject,
} from "./domain";
import {
  SlideView,
  createPresentation,
  layoutWarnings,
  themes,
} from "./render";

type Page = "create" | "outline" | "editor" | "projects";
const examples = [
  {
    name: "产品提案",
    icon: Layers3,
    topic: "新用户引导体验升级提案",
    purpose: "项目提案",
  },
  {
    name: "项目复盘",
    icon: RotateCcw,
    topic: "本季度项目复盘与下一步计划",
    purpose: "项目复盘",
  },
  {
    name: "团队分享",
    icon: BookOpen,
    topic: "让团队更高效协作的实践分享",
    purpose: "知识分享",
  },
];

function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  return (
    <div className="theme-options">
      {(Object.entries(themes) as [ThemeId, typeof themes.ocean][]).map(
        ([key, t]) => (
          <button
            key={key}
            className={`theme-choice ${value === key ? "chosen" : ""}`}
            onClick={() => onChange(key)}
            aria-label={`选择${t.name}主题`}
          >
            <span className="theme-swatch" style={{ background: t.bg }}>
              <i style={{ background: t.accent }} />
              <i style={{ background: t.secondary }} />
              <i style={{ background: t.fg }} />
            </span>
            <span>{t.name}</span>
            {value === key && <Check size={14} />}
          </button>
        ),
      )}
    </div>
  );
}

export function App() {
  const [anna, setAnna] = useState<Anna>(null),
    [connecting, setConnecting] = useState(true);
  const [page, setPage] = useState<Page>("create"),
    [brief, setBrief] = useState<Brief>({ ...defaultBrief });
  const [project, setProject] = useState<Project | null>(null),
    [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [save, setSave] = useState(""),
    [modal, setModal] = useState<
      "themes" | "usage" | "help" | "present" | null
    >(null);
  const [usage, setUsage] = useState<Usage[]>(readUsage),
    [instruction, setInstruction] = useState("");
  const [candidate, setCandidate] = useState<Slide | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"content" | "notes" | "ai">("content"),
    [toast, setToast] = useState("");
  const [showMaterials, setShowMaterials] = useState(false),
    [showInspector, setShowInspector] = useState(true);
  const [exportNotice, setExportNotice] = useState(false);
  const [demo] = useState(sampleProject);
  const repository = useMemo(() => new Repository(anna), [anna]);
  const ai = useMemo(() => new AI(anna), [anna]);
  const abort = useRef(false),
    history = useRef<Project[]>([]),
    queue = useRef(Promise.resolve());
  const current = useRef(project);
  current.current = project;
  const isBusy = !!busy;
  const active = project?.slides[selected];
  const totalCU = usage.reduce((sum, u) => sum + (u.cu ?? 0), 0);
  const unknownCU = usage.filter((u) => u.cu === null).length;

  useEffect(() => {
    let alive = true;
    connectAnna()
      .then((runtime) => {
        if (!alive) return;
        setAnna(runtime);
        const payload = runtime?.entryPayload;
        if (payload && typeof payload === "object")
          setBrief((b) => ({
            ...b,
            topic: b.topic || String(payload.topic || "").slice(0, 120),
            material:
              b.material || String(payload.material || "").slice(0, 10000),
          }));
      })
      .catch((e) => alive && setError(friendlyError(e)))
      .finally(() => alive && setConnecting(false));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!connecting)
      repository
        .list()
        .then(setProjects)
        .catch((e) => setError(friendlyError(e)));
  }, [repository, connecting]);
  useEffect(() => {
    const handler = () => setUsage(readUsage());
    window.addEventListener("briefdeck:usage", handler);
    return () => window.removeEventListener("briefdeck:usage", handler);
  }, []);
  useEffect(() => {
    if (!project || connecting) return;
    setSave("保存中");
    const snapshot = project;
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        try {
          await repository.save(snapshot);
          setProjects((list) => [
            snapshot,
            ...list.filter((p) => p.id !== snapshot.id),
          ]);
          if (
            current.current?.revision === snapshot.revision &&
            current.current?.id === snapshot.id
          )
            setSave("已保存");
        } catch (e) {
          setSave("保存失败");
          setError(friendlyError(e));
        }
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [project, repository, connecting]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (modal !== "present") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "ArrowRight")
        setSelected((s) =>
          Math.min(s + 1, (current.current?.slides.length || 1) - 1),
        );
      if (e.key === "ArrowLeft") setSelected((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);
  useEffect(() => {
    setCandidate(null);
  }, [selected, project?.id]);

  function update(patch: Partial<Project>, undo = true) {
    if (!project) return;
    if (undo) history.current = [...history.current.slice(-29), project];
    setProject(revise(project, patch));
  }
  function updateSlide(patch: Partial<Slide>) {
    if (!project || !active) return;
    update({
      slides: project.slides.map((s) =>
        s.id === active.id ? { ...s, ...patch } : s,
      ),
    });
  }
  function open(
    p: Project,
    target: Page = p.slides.length ? "editor" : "outline",
  ) {
    setProject(p);
    setSelected(0);
    setPage(target);
    setError("");
    setCandidate(null);
    history.current = [];
  }
  async function ensureSaved() {
    if (current.current) {
      await queue.current;
      await repository.save(current.current);
    }
  }
  async function navigate(target: Page) {
    if (isBusy) return;
    try {
      await ensureSaved();
      setPage(target);
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function makeOutline() {
    if (isBusy || connecting) return;
    setError("");
    try {
      const b = BriefSchema.parse(brief);
      setBusy("正在整理汇报结构…");
      ai.beginOperation();
      const outline = await ai.outline(b);
      open(newProject(b, outline), "outline");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (!project || isBusy) return;
    setError("");
    abort.current = false;
    ai.beginOperation();
    let work = revise(project, { status: "generating" });
    setProject(work);
    try {
      const missing = work.outline.filter(
        (o) => !work.slides.some((s) => s.id === o.id),
      );
      for (let i = 0; i < missing.length; i += 3) {
        if (abort.current) break;
        setBusy(`正在生成第 ${i + 1}～${Math.min(i + 3, missing.length)} 页…`);
        const slides = await ai.batch(work, missing.slice(i, i + 3));
        const merged = [...work.slides, ...slides];
        work = revise(work, {
          slides: work.outline
            .map((o) => merged.find((s) => s.id === o.id))
            .filter((s): s is Slide => !!s),
          status: "partial",
        });
        setProject(work);
        await repository.save(work);
      }
      work = revise(work, {
        status:
          work.slides.length === work.outline.length ? "ready" : "partial",
      });
      setProject(work);
      await repository.save(work);
      if (work.slides.length) {
        setPage("editor");
        setSelected(0);
      }
      if (abort.current) setToast("已停止后续批次，已完成页面已保留。");
    } catch (e) {
      setProject(revise(work, { status: "partial" }));
      setError(friendlyError(e));
      if (work.slides.length) setPage("editor");
    } finally {
      setBusy("");
    }
  }
  async function rewrite(instructionText = instruction) {
    if (!project || !active || isBusy) return;
    if (active.locked) {
      setError("请先解除本页锁定，再进行 AI 改写。");
      return;
    }
    if (!instructionText.trim()) {
      setError("请输入希望怎样调整这一页。");
      return;
    }
    setError("");
    setBusy("正在改写这一页…");
    ai.beginOperation();
    try {
      setCandidate(await ai.rewrite(project, active, instructionText));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  async function exportPptx(allowWarnings = false) {
    if (!project?.slides.length || isBusy) return;
    if (
      !allowWarnings &&
      project.slides.some((s) => layoutWarnings(s, project.brief.theme).length)
    ) {
      setExportNotice(true);
      return;
    }
    setExportNotice(false);
    setError("");
    setBusy("正在打包 PowerPoint…");
    try {
      const snapshot = structuredClone(project);
      const blob = (await createPresentation(snapshot).write({
        outputType: "blob",
        compression: true,
      })) as Blob;
      setBusy(anna ? "正在上传并下载…" : "正在下载…");
      await platformDownload(
        anna,
        blob,
        snapshot,
        `${snapshot.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 70)}.pptx`,
      );
      setToast("PPTX 已生成，文字、图形与图表可继续编辑。");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  async function importMaterial(file?: File) {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 100000) {
      setError("请导入 100 KB 以内的 .txt 或 .md 文件。");
      return;
    }
    try {
      const text = await file.text();
      if (text.length > 10000)
        throw new Error("参考材料最多 10,000 个字符，请精简后导入。");
      setBrief((b) => ({ ...b, material: text }));
      setShowMaterials(true);
      setToast("材料已导入");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 500000)
        throw new Error("项目文件过大，请选择 500 KB 以内的 BriefDeck JSON。");
      const parsed = ProjectSchema.parse(JSON.parse(await file.text()));
      open({
        ...parsed,
        id: id(),
        revision: 0,
        updatedAt: new Date().toISOString(),
      });
      setToast("项目已导入为新副本");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  function changeLayout(layout: Layout) {
    if (layout === "chart" && !active?.chart) {
      updateSlide({
        layout,
        chart: {
          type: "bar",
          labels: ["分类一", "分类二"],
          series: [{ name: "请填写真实数据", values: [0, 0] }],
          unit: "",
        },
        body: ["请填写并核实图表数据"],
      });
    } else
      updateSlide({
        layout,
        chart: layout === "chart" ? active?.chart : undefined,
      });
  }
  function moveSlide(from: number, delta: number) {
    if (!project) return;
    const to = from + delta;
    if (to < 0 || to >= project.slides.length) return;
    const list = [...project.slides];
    [list[from], list[to]] = [list[to], list[from]];
    update({
      slides: list,
      outline: list.map(
        (s) =>
          project.outline.find((o) => o.id === s.id) || {
            id: s.id,
            title: s.title,
            purpose: s.subtitle,
            layout: s.layout,
            sourceIds: s.sourceIds,
          },
      ),
    });
    setSelected(to);
  }
  function editOutline(index: number, patch: Partial<OutlineItem>) {
    if (!project) return;
    const target = project.outline[index];
    update({
      outline: project.outline.map((o, i) =>
        i === index ? { ...o, ...patch } : o,
      ),
      slides: project.slides.filter((s) => s.id !== target.id),
    });
  }
  function usageCSV() {
    const rows = [
      [
        "at",
        "operation",
        "model",
        "input_tokens",
        "output_tokens",
        "cu",
        "elapsed_ms",
        "status",
      ],
      ...usage.map((u) => [
        u.at,
        u.operation,
        u.model,
        u.inputTokens ?? "",
        u.outputTokens ?? "",
        u.cu ?? "unknown",
        u.elapsedMs,
        u.status,
      ]),
    ];
    localDownload(
      new Blob(
        [
          "\uFEFF" +
            rows
              .map((r) =>
                r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      "briefdeck-usage.csv",
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => navigate("create")}
          aria-label="BriefDeck 首页"
        >
          <span className="brand-icon">
            <Presentation size={23} strokeWidth={1.7} />
          </span>
          <span>
            Brief<span className="brand-deck">Deck</span>
            <small>简报工坊</small>
          </span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button
            className={page !== "projects" ? "active" : ""}
            onClick={() =>
              navigate(project && page !== "create" ? "editor" : "create")
            }
          >
            工作台
          </button>
          <button
            className={page === "projects" ? "active" : ""}
            onClick={() => navigate("projects")}
          >
            我的演示<span className="nav-count">{projects.length}</span>
          </button>
        </nav>
        <div className="header-right">
          <button className="usage-pill" onClick={() => setModal("usage")}>
            <Sparkles size={14} />
            <span>{totalCU ? `${totalCU.toFixed(2)} CU` : "额度记录"}</span>
          </button>
          <button
            className="icon-button help-button"
            onClick={() => setModal("help")}
            aria-label="使用帮助"
          >
            <CircleHelp size={19} />
          </button>
          <div className="avatar">B</div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}

      {page === "create" && (
        <main className="create-page">
          <div className="page-intro">
            <div>
              <div className="eyebrow">
                <span />
                YOUR NEXT GREAT PRESENTATION
              </div>
              <h1>
                好想法，值得一份好演示<span>。</span>
              </h1>
              <p>把零散的材料交给 AI，让清晰的表达从这里开始。</p>
            </div>
            <button
              className="text-button"
              onClick={() => open(sampleProject())}
            >
              <Play size={15} />
              体验示例
            </button>
          </div>
          <div className="creation-grid">
            <section className="brief-card">
              <div className="card-heading">
                <span className="heading-icon">
                  <WandSparkles size={20} />
                </span>
                <div>
                  <h2>你想讲述什么？</h2>
                  <p>给一个主题，或带上你的工作材料。</p>
                </div>
                <span className="step-badge">01 / 03</span>
              </div>
              <div className="form-body">
                <label className="field-label" htmlFor="topic">
                  演示主题 <span>必填</span>
                </label>
                <textarea
                  id="topic"
                  className="topic-input"
                  maxLength={120}
                  placeholder="例如：一份面向团队主管的新用户引导改版提案"
                  value={brief.topic}
                  onChange={(e) =>
                    setBrief({ ...brief, topic: e.target.value })
                  }
                  disabled={isBusy}
                />
                <div className="input-meta">
                  <span>一句话，告诉我们你的想法</span>
                  <span>{brief.topic.length}/120</span>
                </div>
                <div className="quick-start">
                  {examples.map((ex) => (
                    <button
                      key={ex.name}
                      onClick={() =>
                        setBrief({
                          ...brief,
                          topic: ex.topic,
                          purpose: ex.purpose,
                        })
                      }
                      disabled={isBusy}
                    >
                      <ex.icon size={14} />
                      {ex.name}
                    </button>
                  ))}
                </div>
                <div className="form-separator" />
                <div className="material-heading">
                  <label className="field-label" htmlFor="material">
                    参考材料 <span className="optional">选填</span>
                  </label>
                  <label className="file-label">
                    <Upload size={14} />
                    导入文本
                    <input
                      type="file"
                      accept=".txt,.md"
                      hidden
                      onChange={(e) => {
                        void importMaterial(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      disabled={isBusy}
                    />
                  </label>
                </div>
                <textarea
                  id="material"
                  className="material-input"
                  maxLength={10000}
                  placeholder="粘贴项目背景、关键数据或已有文案。内容越具体，演示越贴近你的想法。"
                  value={brief.material}
                  onChange={(e) =>
                    setBrief({ ...brief, material: e.target.value })
                  }
                  disabled={isBusy}
                />
                <div className="form-row">
                  <div>
                    <label className="field-label" htmlFor="audience">
                      讲给谁听
                    </label>
                    <select
                      id="audience"
                      value={brief.audience}
                      onChange={(e) =>
                        setBrief({ ...brief, audience: e.target.value })
                      }
                      disabled={isBusy}
                    >
                      <option>团队与主管</option>
                      <option>客户与合作伙伴</option>
                      <option>投资人与评审</option>
                      <option>同学与老师</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="purpose">
                      演示目的
                    </label>
                    <select
                      id="purpose"
                      value={brief.purpose}
                      onChange={(e) =>
                        setBrief({ ...brief, purpose: e.target.value })
                      }
                      disabled={isBusy}
                    >
                      <option>项目提案</option>
                      <option>项目复盘</option>
                      <option>产品介绍</option>
                      <option>知识分享</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label className="field-label">演示页数</label>
                    <div className="segmented">
                      {([6, 8, 10, 12] as const).map((n) => (
                        <button
                          key={n}
                          className={brief.pageCount === n ? "selected" : ""}
                          onClick={() => setBrief({ ...brief, pageCount: n })}
                          disabled={isBusy}
                        >
                          {n} 页
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="language">
                      内容语言
                    </label>
                    <select
                      id="language"
                      value={brief.language}
                      onChange={(e) =>
                        setBrief({
                          ...brief,
                          language: e.target.value as Brief["language"],
                        })
                      }
                      disabled={isBusy}
                    >
                      <option value="zh-CN">简体中文</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
                <div className="generate-area">
                  <button
                    className="primary-button generate-button"
                    onClick={makeOutline}
                    disabled={
                      isBusy ||
                      connecting ||
                      !anna ||
                      brief.topic.trim().length < 2
                    }
                  >
                    {isBusy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Sparkles size={18} />
                    )}
                    {busy || "生成演示大纲"}
                    {!isBusy && <span>先梳理，再出彩</span>}
                  </button>
                  <p>
                    <LockKeyhole size={12} />
                    {connecting
                      ? "正在连接 Anna…"
                      : anna
                        ? "使用当前 Anna 账号额度 · 确认大纲后再生成页面"
                        : "本地预览尚未连接 Anna · 可先体验示例的编辑与导出"}
                  </p>
                </div>
              </div>
            </section>
            <aside className="inspiration-column">
              <div className="preview-heading">
                <div>
                  <span className="tiny-label">为你的想法，找到合适的样子</span>
                  <h2>从内容，到呈现。</h2>
                </div>
                <span className="format-badge">16:9 · PPTX</span>
              </div>
              <div className="preview-stack">
                <div className="stack-back" />
                <div className="stack-middle" />
                <div className="hero-slide">
                  <SlideView slide={demo.slides[0]} theme={brief.theme} />
                  <div className="slide-watermark">
                    <span>示例预览</span>
                    <span>01 / 08</span>
                  </div>
                </div>
              </div>
              <div className="preview-caption">
                <span className="caption-icon">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>好看，也能继续修改</strong>
                  <span>原生文字、图形与图表，下载后依然可编辑。</span>
                </div>
              </div>
              <div className="theme-card">
                <div className="section-title">
                  <h3>
                    <Palette size={16} />
                    选择你的风格
                  </h3>
                  <span>随时可切换</span>
                </div>
                <ThemePicker
                  value={brief.theme}
                  onChange={(theme) => setBrief({ ...brief, theme })}
                />
              </div>
              <div className="how-it-works">
                <div>
                  <span className="process-icon">
                    <FileText size={17} />
                  </span>
                  <strong>输入想法</strong>
                  <small>主题与材料</small>
                </div>
                <i />
                <div>
                  <span className="process-icon">
                    <Sparkles size={17} />
                  </span>
                  <strong>打磨结构</strong>
                  <small>确认演示大纲</small>
                </div>
                <i />
                <div>
                  <span className="process-icon">
                    <Presentation size={17} />
                  </span>
                  <strong>自在呈现</strong>
                  <small>编辑并下载</small>
                </div>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>CRAFTED FOR CLEARER THINKING</span>
            <span>
              Powered by Anna AI
              <span
                className={`connection-indicator ${anna ? "connected" : ""}`}
              />
              {anna ? "平台已连接" : "本地预览"}
            </span>
          </footer>
        </main>
      )}

      {page === "outline" && project && (
        <main className="outline-page">
          <div className="workspace-heading">
            <div>
              <button
                className="back-button"
                onClick={() => navigate("create")}
              >
                <ChevronLeft size={16} />
                返回工作台
              </button>
              <div className="eyebrow">先把故事讲清楚</div>
              <h1>一个好大纲，是一半的好演示。</h1>
              <p>调整每一页的重点与顺序，满意后再生成幻灯片。</p>
            </div>
            <span className="step-badge">02 / 03</span>
          </div>
          <div className="outline-summary">
            <Presentation size={18} />
            <strong>{project.title}</strong>
            <span>{project.outline.length} 页</span>
            <span>{project.brief.audience}</span>
            <span>{themes[project.brief.theme].name}</span>
            <span className="save-state">{save}</span>
          </div>
          <div className="outline-list">
            {project.outline.map((o, i) => (
              <article className="outline-item" key={o.id}>
                <span className="outline-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="outline-fields">
                  <input
                    aria-label={`第${i + 1}页标题`}
                    value={o.title}
                    maxLength={100}
                    onChange={(e) => editOutline(i, { title: e.target.value })}
                    disabled={isBusy}
                  />
                  <input
                    className="outline-purpose"
                    aria-label={`第${i + 1}页目的`}
                    value={o.purpose}
                    maxLength={200}
                    onChange={(e) =>
                      editOutline(i, { purpose: e.target.value })
                    }
                    disabled={isBusy}
                  />
                </div>
                <select
                  aria-label={`第${i + 1}页版式`}
                  value={o.layout}
                  onChange={(e) =>
                    editOutline(i, { layout: e.target.value as Layout })
                  }
                  disabled={isBusy}
                >
                  {LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {layoutNames[l]}
                    </option>
                  ))}
                </select>
                <div className="outline-controls">
                  <button
                    className="icon-button"
                    aria-label={`上移第${i + 1}页`}
                    disabled={isBusy || i === 0}
                    onClick={() => {
                      const list = [...project.outline];
                      [list[i - 1], list[i]] = [list[i], list[i - 1]];
                      update({ outline: list });
                    }}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`下移第${i + 1}页`}
                    disabled={isBusy || i === project.outline.length - 1}
                    onClick={() => {
                      const list = [...project.outline];
                      [list[i + 1], list[i]] = [list[i], list[i + 1]];
                      update({ outline: list });
                    }}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`删除大纲第${i + 1}页`}
                    disabled={isBusy || project.outline.length <= 1}
                    onClick={() =>
                      update({
                        outline: project.outline.filter((x) => x.id !== o.id),
                        slides: project.slides.filter((s) => s.id !== o.id),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <button
            className="add-outline"
            disabled={isBusy || project.outline.length >= 12}
            onClick={() =>
              update({
                outline: [
                  ...project.outline,
                  {
                    id: `s-${id()}`,
                    title: "新的页面",
                    purpose: "这一页希望表达什么？",
                    layout: "bullets",
                    sourceIds: [],
                  },
                ],
              })
            }
          >
            <Plus size={17} />
            添加一页
          </button>
          <div className="outline-bottom">
            <div>
              <strong>{isBusy ? busy : "结构由你把关，表达交给 AI。"}</strong>
              <p>
                {isBusy
                  ? "已完成批次会立即保存。停止将在当前批次完成后生效。"
                  : `${project.slides.length} / ${project.outline.length} 页已有内容，继续生成会复用已完成页面。`}
              </p>
            </div>
            {isBusy ? (
              <button
                className="secondary-button"
                onClick={() => {
                  abort.current = true;
                  setToast("将在当前批次完成后停止");
                }}
              >
                停止后续生成
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={generate}
                disabled={
                  !anna ||
                  project.outline.some(
                    (o) => !o.title.trim() || !o.purpose.trim(),
                  )
                }
              >
                <Sparkles size={17} />
                {project.slides.length ? "继续生成 PPT" : "确认大纲，生成 PPT"}
              </button>
            )}
          </div>
        </main>
      )}

      {page === "editor" && project && (
        <main className="editor-page">
          <div className="editor-toolbar">
            <div className="editor-title">
              <button
                className="icon-button"
                aria-label="返回我的演示"
                onClick={() => navigate("projects")}
              >
                <ChevronLeft size={20} />
              </button>
              <div>
                <input
                  aria-label="项目名称"
                  value={project.title}
                  maxLength={120}
                  onChange={(e) => update({ title: e.target.value })}
                  disabled={isBusy}
                />
                <span>
                  {project.demo ? "可编辑示例 · 演示数据" : "演示文稿"}
                  <span>·</span>
                  {save || "准备中"}
                  <span>·</span>
                  {project.slides.length} 页
                </span>
              </div>
            </div>
            <div className="toolbar-actions">
              <button
                className="icon-button"
                aria-label="撤销"
                title="撤销"
                disabled={isBusy || !history.current.length}
                onClick={() => {
                  const previous = history.current.pop();
                  if (previous) {
                    setProject(
                      revise(previous, { revision: project.revision + 1 }),
                    );
                    setSelected((s) => Math.min(s, previous.slides.length - 1));
                  }
                }}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="secondary-button compact"
                onClick={() => setModal("themes")}
                disabled={isBusy}
              >
                <Palette size={16} />
                <span>主题</span>
              </button>
              <button
                className="secondary-button compact"
                onClick={() => setModal("present")}
                disabled={!active || isBusy}
              >
                <Play size={16} />
                <span>放映</span>
              </button>
              <button
                className="primary-button compact"
                onClick={() => exportPptx()}
                disabled={isBusy || !project.slides.length}
              >
                {isBusy && busy.includes("PowerPoint") ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Download size={16} />
                )}
                <span>导出 PPTX</span>
              </button>
            </div>
          </div>
          {project.status === "partial" &&
            project.slides.length < project.outline.length && (
              <div className="partial-banner">
                已保留 {project.slides.length} 页，尚有{" "}
                {project.outline.length - project.slides.length} 页待生成。
                <button onClick={() => setPage("outline")} disabled={isBusy}>
                  继续生成
                </button>
              </div>
            )}
          <div
            className={`editor-layout ${!showInspector ? "inspector-hidden" : ""}`}
          >
            <aside className="slide-sidebar">
              <div className="sidebar-label">
                幻灯片<span>{project.slides.length}</span>
              </div>
              <div className="slide-list">
                {project.slides.map((s, i) => (
                  <button
                    className={`slide-thumb ${selected === i ? "active" : ""}`}
                    key={s.id}
                    onClick={() => setSelected(i)}
                    disabled={isBusy}
                  >
                    <span className="thumb-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <SlideView
                        slide={s}
                        theme={project.brief.theme}
                        index={i}
                        total={project.slides.length}
                      />
                      {s.locked && (
                        <LockKeyhole size={12} className="thumb-lock" />
                      )}
                    </div>
                    <span className="thumb-title">
                      {s.title.replace(/\n/g, "")}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="add-slide-button"
                disabled={isBusy || project.slides.length >= 12}
                onClick={() => {
                  const s = blankSlide();
                  update({
                    slides: [...project.slides, s],
                    outline: [
                      ...project.outline,
                      {
                        id: s.id,
                        title: s.title,
                        purpose: "补充说明",
                        layout: s.layout,
                        sourceIds: [],
                      },
                    ],
                  });
                  setSelected(project.slides.length);
                }}
              >
                <Plus size={16} />
                添加页面
              </button>
            </aside>
            <section className="canvas-area">
              {active ? (
                <>
                  <div className="canvas-topline">
                    <span>
                      {layoutNames[active.layout]}
                      <i />
                      16:9
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        onClick={() => setShowInspector(!showInspector)}
                        aria-label="切换编辑面板"
                      >
                        <Settings2 size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setModal("present")}
                        aria-label="放大预览"
                      >
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="main-slide">
                    <SlideView
                      slide={active}
                      theme={project.brief.theme}
                      index={selected}
                      total={project.slides.length}
                    />
                  </div>
                  <div className="canvas-bottomline">
                    <span>
                      {selected + 1} / {project.slides.length}
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="上一页"
                        onClick={() => setSelected((s) => Math.max(0, s - 1))}
                        disabled={selected === 0 || isBusy}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="下一页"
                        onClick={() =>
                          setSelected((s) =>
                            Math.min(project.slides.length - 1, s + 1),
                          )
                        }
                        disabled={
                          selected === project.slides.length - 1 || isBusy
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="notes-preview">
                    <BookOpen size={16} />
                    <div>
                      <strong>讲稿备注</strong>
                      <p>
                        {active.notes || "为这一页补充讲稿，让表达更从容。"}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setShowInspector(true);
                        setPanel("notes");
                      }}
                    >
                      编辑
                    </button>
                  </div>
                  {layoutWarnings(active, project.brief.theme).length > 0 && (
                    <div className="layout-warning">
                      {layoutWarnings(active, project.brief.theme)[0]}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Presentation size={40} />
                  <h2>添加你的第一页</h2>
                </div>
              )}
            </section>
            {showInspector && active && (
              <aside className="inspector">
                <div className="inspector-tabs">
                  <button
                    className={panel === "content" ? "active" : ""}
                    onClick={() => setPanel("content")}
                  >
                    内容
                  </button>
                  <button
                    className={panel === "notes" ? "active" : ""}
                    onClick={() => setPanel("notes")}
                  >
                    讲稿
                  </button>
                  <button
                    className={panel === "ai" ? "active" : ""}
                    onClick={() => setPanel("ai")}
                  >
                    <Sparkles size={13} />
                    AI 改写
                  </button>
                </div>
                <div className="inspector-body">
                  {panel === "content" && (
                    <>
                      <label className="field-label" htmlFor="slide-layout">
                        页面版式
                      </label>
                      <select
                        id="slide-layout"
                        value={active.layout}
                        onChange={(e) => changeLayout(e.target.value as Layout)}
                        disabled={isBusy}
                      >
                        {LAYOUTS.map((l) => (
                          <option key={l} value={l}>
                            {layoutNames[l]}
                          </option>
                        ))}
                      </select>
                      <label className="field-label" htmlFor="slide-title">
                        页面标题
                      </label>
                      <textarea
                        id="slide-title"
                        value={active.title}
                        maxLength={100}
                        onChange={(e) => updateSlide({ title: e.target.value })}
                        disabled={isBusy}
                      />
                      <label className="field-label" htmlFor="slide-subtitle">
                        引导语
                      </label>
                      <input
                        id="slide-subtitle"
                        value={active.subtitle}
                        maxLength={160}
                        onChange={(e) =>
                          updateSlide({ subtitle: e.target.value })
                        }
                        disabled={isBusy}
                      />
                      <label className="field-label" htmlFor="slide-body">
                        正文 <span>每行一条</span>
                      </label>
                      <textarea
                        id="slide-body"
                        className="body-editor"
                        value={active.body.join("\n")}
                        onChange={(e) =>
                          updateSlide({
                            body: e.target.value
                              .split("\n")
                              .slice(0, 6)
                              .map((v) => v.slice(0, 160)),
                          })
                        }
                        disabled={isBusy}
                      />
                      <p className="field-help">
                        最多 6
                        条；双栏前半为左栏，后半为右栏；时间线用「阶段｜说明」。
                      </p>
                      {active.chart && (
                        <ChartEditor
                          chart={active.chart}
                          disabled={isBusy}
                          onChange={(chart) => updateSlide({ chart })}
                        />
                      )}
                      <button
                        className="source-toggle"
                        onClick={() => setShowMaterials(!showMaterials)}
                      >
                        <FileText size={14} />
                        材料与引用
                        <span>
                          {active.sourceIds.length
                            ? active.sourceIds.join(" · ")
                            : "未引用"}
                        </span>
                      </button>
                      {showMaterials && (
                        <div className="source-material">
                          {materialSources(project.brief.material).length
                            ? materialSources(project.brief.material).map(
                                (s) => (
                                  <p key={s.id}>
                                    <strong>{s.id}</strong> {s.text}
                                  </p>
                                ),
                              )
                            : "此项目未提供参考材料。请核实所有事实与数字。"}
                        </div>
                      )}
                      <div className="slide-actions">
                        <button
                          className={`secondary-button compact ${active.locked ? "locked" : ""}`}
                          onClick={() =>
                            updateSlide({ locked: !active.locked })
                          }
                          disabled={isBusy}
                        >
                          <LockKeyhole size={14} />
                          {active.locked ? "已锁定 AI 改写" : "锁定 AI 改写"}
                        </button>
                        <div>
                          <button
                            className="icon-button"
                            aria-label="上移当前页"
                            disabled={isBusy || !selected}
                            onClick={() => moveSlide(selected, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="下移当前页"
                            disabled={
                              isBusy || selected === project.slides.length - 1
                            }
                            onClick={() => moveSlide(selected, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label="删除当前页"
                            disabled={isBusy || project.slides.length <= 1}
                            onClick={() => {
                              update({
                                slides: project.slides.filter(
                                  (s) => s.id !== active.id,
                                ),
                                outline: project.outline.filter(
                                  (s) => s.id !== active.id,
                                ),
                              });
                              setSelected(Math.max(0, selected - 1));
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {panel === "notes" && (
                    <>
                      <div className="inspector-description">
                        <BookOpen size={20} />
                        <h3>把想说的话，留在这里。</h3>
                        <p>
                          讲稿会随 PPTX 一起导出，出现在 PowerPoint 的备注区。
                        </p>
                      </div>
                      <label className="field-label" htmlFor="notes">
                        本页讲稿
                      </label>
                      <textarea
                        id="notes"
                        className="notes-editor"
                        value={active.notes}
                        maxLength={1200}
                        onChange={(e) => updateSlide({ notes: e.target.value })}
                        disabled={isBusy}
                      />
                      <p className="field-help">
                        {active.notes.length} / 1,200 字符
                      </p>
                    </>
                  )}
                  {panel === "ai" && (
                    <>
                      <div className="inspector-description">
                        <WandSparkles size={22} />
                        <h3>让这一页，更进一步。</h3>
                        <p>
                          只改写当前页，保持图表数据不变。生成后由你决定是否应用。
                        </p>
                      </div>
                      <div className="rewrite-presets">
                        {[
                          "精简文字，突出核心结论",
                          "更正式，适合向主管汇报",
                          "更口语化，适合现场演讲",
                        ].map((v) => (
                          <button
                            key={v}
                            disabled={isBusy || !anna || active.locked}
                            onClick={() => {
                              setInstruction(v);
                              void rewrite(v);
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <label className="field-label" htmlFor="rewrite">
                        你的调整要求
                      </label>
                      <textarea
                        id="rewrite"
                        placeholder="例如：突出需要主管做的决策，保留已有事实。"
                        value={instruction}
                        maxLength={500}
                        onChange={(e) => setInstruction(e.target.value)}
                        disabled={isBusy}
                      />
                      <button
                        className="primary-button full-width"
                        disabled={
                          isBusy ||
                          !anna ||
                          active.locked ||
                          !instruction.trim()
                        }
                        onClick={() => rewrite()}
                      >
                        {isBusy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                        {isBusy ? busy : "生成改写预览"}
                      </button>
                      {!anna && (
                        <p className="field-help">
                          在 Anna 中打开应用后即可使用 AI 改写。
                        </p>
                      )}
                      {active.locked && (
                        <p className="field-help">
                          当前页已锁定，请先在内容面板解除锁定。
                        </p>
                      )}
                      {candidate && (
                        <div className="candidate">
                          <span className="eyebrow">改写候选</span>
                          <h3>{candidate.title}</h3>
                          {candidate.body.map((b, i) => (
                            <p key={i}>{b}</p>
                          ))}
                          <div>
                            <button
                              className="primary-button compact"
                              onClick={() => {
                                updateSlide(candidate);
                                setCandidate(null);
                                setToast("已应用改写，可使用撤销恢复");
                              }}
                            >
                              <Check size={15} />
                              应用
                            </button>
                            <button
                              className="secondary-button compact"
                              onClick={() => setCandidate(null)}
                            >
                              放弃
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>
            )}
          </div>
        </main>
      )}

      {page === "projects" && (
        <main className="projects-page">
          <div className="page-intro">
            <div>
              <div className="eyebrow">YOUR PRESENTATION LIBRARY</div>
              <h1>每一次表达，都在这里。</h1>
              <p>
                {anna
                  ? "你的项目保存在当前 Anna 账号下。"
                  : "本地预览项目保存在当前浏览器；Anna 项目独立保存于平台。"}
              </p>
            </div>
            <div className="inline-actions">
              <label className="secondary-button">
                <Upload size={16} />
                导入项目
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={(e) => {
                    void importProject(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="primary-button"
                onClick={() => {
                  setBrief({ ...defaultBrief });
                  setPage("create");
                }}
              >
                <Plus size={17} />
                新建演示
              </button>
            </div>
          </div>
          <div className="project-grid">
            {projects.map((p) => (
              <article className="project-card" key={p.id}>
                <button className="project-cover" onClick={() => open(p)}>
                  {p.slides.length ? (
                    <SlideView
                      slide={p.slides[0]}
                      theme={p.brief.theme}
                      total={p.slides.length}
                    />
                  ) : (
                    <div className="outline-cover">
                      <FileText size={34} />
                      <span>大纲已就绪</span>
                    </div>
                  )}
                </button>
                <div className="project-info">
                  <button onClick={() => open(p)}>
                    <h3>{p.title}</h3>
                  </button>
                  <p>
                    <span>{p.slides.length || p.outline.length} 页</span>
                    <span>
                      {p.demo
                        ? "示例项目"
                        : p.status === "ready"
                          ? "可编辑"
                          : "待完成"}
                    </span>
                    <span>
                      {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                  </p>
                  <div className="project-card-actions">
                    <button
                      onClick={() => {
                        const copy = {
                          ...p,
                          id: id(),
                          title: `${p.title.slice(0, 100)} · 副本`,
                          revision: 0,
                        };
                        open(copy);
                      }}
                    >
                      <Copy size={14} />
                      复制
                    </button>
                    <button
                      onClick={() =>
                        localDownload(
                          new Blob([JSON.stringify(p, null, 2)], {
                            type: "application/json",
                          }),
                          `briefdeck-${p.id.slice(0, 8)}.json`,
                        )
                      }
                    >
                      <Download size={14} />
                      备份
                    </button>
                    <button
                      aria-label={`删除项目${p.title}`}
                      onClick={() => setDeleteId(p.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            <button
              className="new-project-card"
              onClick={() => {
                setBrief({ ...defaultBrief });
                setPage("create");
              }}
            >
              <span>
                <Plus size={26} />
              </span>
              <strong>开始新的表达</strong>
              <small>从一个想法开始</small>
            </button>
          </div>
          {!projects.length && (
            <div className="library-tip">
              <Presentation size={18} />
              <span>还没有演示文稿？先用示例探索编辑与导出。</span>
              <button
                className="text-button"
                onClick={() => open(sampleProject())}
              >
                打开示例
              </button>
            </div>
          )}
        </main>
      )}

      {modal && (
        <div
          className={`modal-backdrop ${modal === "present" ? "presentation-backdrop" : ""}`}
          onClick={() => setModal(null)}
        >
          <section
            className={`modal ${modal === "present" ? "presentation-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "usage"
                ? "额度记录"
                : modal === "themes"
                  ? "选择主题"
                  : modal === "help"
                    ? "使用帮助"
                    : "演示放映"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭对话框"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "themes" && (
              <>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h2>为内容，选一种气质。</h2>
                <p className="muted">主题只改变呈现，不消耗 AI 额度。</p>
                <ThemePicker
                  value={project?.brief.theme || brief.theme}
                  onChange={(theme) => {
                    if (project && page === "editor")
                      update({ brief: { ...project.brief, theme } });
                    else setBrief({ ...brief, theme });
                  }}
                />
                <div className="theme-preview">
                  <SlideView
                    slide={active || demo.slides[0]}
                    theme={
                      project && page === "editor"
                        ? project.brief.theme
                        : brief.theme
                    }
                  />
                </div>
              </>
            )}
            {modal === "usage" && (
              <>
                <span className="eyebrow">THOUGHTFUL AI USAGE</span>
                <h2>让每一次生成，都有记录。</h2>
                <div className="usage-summary">
                  <div>
                    <strong>{totalCU.toFixed(2)}</strong>
                    <span>已记录 CU</span>
                  </div>
                  <div>
                    <strong>{usage.length}</strong>
                    <span>请求次数</span>
                  </div>
                  <div>
                    <strong>{unknownCU}</strong>
                    <span>额度待核对</span>
                  </div>
                </div>
                <p className="muted">
                  这里记录当前浏览器收到的调用用量；缺少费用的请求标为未知，最终以
                  Anna 账单为准。
                </p>
                <div className="usage-table">
                  {usage.length ? (
                    usage
                      .slice()
                      .reverse()
                      .slice(0, 30)
                      .map((u) => (
                        <div key={u.id}>
                          <span>
                            {u.operation === "outline"
                              ? "生成大纲"
                              : u.operation === "slides"
                                ? "生成页面"
                                : "单页改写"}
                            <small>{u.model}</small>
                          </span>
                          <span>{(u.elapsedMs / 1000).toFixed(1)}s</span>
                          <strong>
                            {u.cu === null ? "未知" : `${u.cu.toFixed(2)} CU`}
                          </strong>
                        </div>
                      ))
                  ) : (
                    <div className="empty-usage">
                      尚无 AI 调用。手动编辑、切换主题与导出不调用模型。
                    </div>
                  )}
                </div>
                <button className="secondary-button" onClick={usageCSV}>
                  <Download size={16} />
                  下载用量 CSV
                </button>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="eyebrow">A LITTLE GUIDANCE</span>
                <h2>从好想法，到好演示。</h2>
                <ol className="help-list">
                  <li>
                    <strong>描述你的主题</strong>
                    <p>
                      补充受众、目标与材料。具体的输入会带来更贴近需求的内容。
                    </p>
                  </li>
                  <li>
                    <strong>先确认大纲</strong>
                    <p>
                      修改标题、版式与顺序，再分批生成页面。失败时保留已有页面。
                    </p>
                  </li>
                  <li>
                    <strong>打磨并下载</strong>
                    <p>
                      编辑文字、图表与讲稿，使用单页改写，最后下载可编辑 PPTX。
                    </p>
                  </li>
                </ol>
                <div className="help-note">
                  {anna
                    ? "已连接 Anna，AI 使用当前账号额度。"
                    : "当前为本地预览。AI 需要在 Anna 平台中运行；可使用示例体验所有手动编辑和导出功能。"}
                  <br />
                  图表和业务事实请在正式使用前核实。示例项目中的数据仅供演示。
                </div>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setModal(null);
                    open(sampleProject());
                  }}
                >
                  <Play size={15} />
                  打开示例
                </button>
              </>
            )}
            {modal === "present" && active && project && (
              <>
                <SlideView
                  slide={active}
                  theme={project.brief.theme}
                  index={selected}
                  total={project.slides.length}
                />
                <div className="presentation-controls">
                  <button
                    className="icon-button"
                    onClick={() => setSelected((s) => Math.max(0, s - 1))}
                    disabled={!selected}
                    aria-label="放映上一页"
                  >
                    <ChevronLeft />
                  </button>
                  <span>
                    {selected + 1} / {project.slides.length}
                  </span>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setSelected((s) =>
                        Math.min(project.slides.length - 1, s + 1),
                      )
                    }
                    disabled={selected === project.slides.length - 1}
                    aria-label="放映下一页"
                  >
                    <ChevronRight />
                  </button>
                  <span className="presentation-hint">
                    方向键翻页 · Esc 退出
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-label="删除项目"
          >
            <h2>删除这个项目？</h2>
            <p className="muted">
              项目及平台导出文件将被删除。你可以先下载项目备份。
            </p>
            <div className="inline-actions">
              <button
                className="secondary-button"
                onClick={() => setDeleteId(null)}
              >
                保留项目
              </button>
              <button
                className="primary-button danger-button"
                onClick={async () => {
                  try {
                    await repository.remove(deleteId);
                    setProjects((list) =>
                      list.filter((p) => p.id !== deleteId),
                    );
                    if (project?.id === deleteId) setProject(null);
                    setDeleteId(null);
                  } catch (e) {
                    setError(friendlyError(e));
                    setDeleteId(null);
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </section>
        </div>
      )}
      {exportNotice && (
        <div className="modal-backdrop">
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-label="检查排版"
          >
            <h2>部分内容可能需要精简。</h2>
            <p className="muted">
              检测到文本可能超出预留空间。建议检查页面，也可以先导出并在
              PowerPoint 中继续调整。
            </p>
            <div className="inline-actions">
              <button
                className="secondary-button"
                onClick={() => setExportNotice(false)}
              >
                返回检查
              </button>
              <button
                className="primary-button"
                onClick={() => exportPptx(true)}
              >
                继续导出
              </button>
            </div>
          </section>
        </div>
      )}
      {isBusy && page === "editor" && (
        <div className="working-toast">
          <LoaderCircle size={17} className="spin" />
          {busy}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function ChartEditor({
  chart,
  onChange,
  disabled,
}: {
  chart: ChartData;
  onChange: (chart: ChartData) => void;
  disabled: boolean;
}) {
  return (
    <div className="chart-editor">
      <div className="section-title">
        <h3>图表数据</h3>
        <select
          aria-label="图表类型"
          value={chart.type}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...chart, type: e.target.value as "bar" | "line" })
          }
        >
          <option value="bar">柱状图</option>
          <option value="line">折线图</option>
        </select>
      </div>
      <label className="field-label" htmlFor="chart-unit">
        单位
      </label>
      <input
        id="chart-unit"
        maxLength={20}
        value={chart.unit}
        onChange={(e) => onChange({ ...chart, unit: e.target.value })}
        disabled={disabled}
      />
      {chart.series.map((s, si) => (
        <label className="series-name" key={si}>
          指标 {si + 1}
          <input
            aria-label={`指标${si + 1}名称`}
            value={s.name}
            maxLength={30}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...chart,
                series: chart.series.map((v, i) =>
                  i === si ? { ...v, name: e.target.value } : v,
                ),
              })
            }
          />
        </label>
      ))}
      <div className="data-table">
        {chart.labels.map((l, i) => (
          <div key={i}>
            <input
              aria-label={`分类${i + 1}`}
              maxLength={30}
              value={l}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...chart,
                  labels: chart.labels.map((v, j) =>
                    i === j ? e.target.value : v,
                  ),
                })
              }
            />
            {chart.series.map((s, si) => (
              <input
                key={si}
                aria-label={`分类${i + 1}指标${si + 1}数值`}
                type="number"
                step="any"
                value={s.values[i]}
                disabled={disabled}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  if (Number.isFinite(num))
                    onChange({
                      ...chart,
                      series: chart.series.map((v, j) =>
                        si === j
                          ? {
                              ...v,
                              values: v.values.map((n, ni) =>
                                i === ni ? num : n,
                              ),
                            }
                          : v,
                      ),
                    });
                }}
              />
            ))}
            <button
              className="icon-button"
              aria-label={`删除分类${i + 1}`}
              disabled={disabled || chart.labels.length <= 1}
              onClick={() =>
                onChange({
                  ...chart,
                  labels: chart.labels.filter((_, j) => i !== j),
                  series: chart.series.map((s) => ({
                    ...s,
                    values: s.values.filter((_, j) => i !== j),
                  })),
                })
              }
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="text-button"
        disabled={disabled || chart.labels.length >= 8}
        onClick={() =>
          onChange({
            ...chart,
            labels: [...chart.labels, `分类${chart.labels.length + 1}`],
            series: chart.series.map((s) => ({
              ...s,
              values: [...s.values, 0],
            })),
          })
        }
      >
        <Plus size={14} />
        添加分类
      </button>
      <p className="field-help">请填写已核实的数据。最多 8 个分类。</p>
    </div>
  );
}
