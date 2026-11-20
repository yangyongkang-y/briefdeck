import pptxgen from "pptxgenjs";
import { ChartData, Project, Slide, ThemeId } from "./domain";

export const themes: Record<
  ThemeId,
  {
    name: string;
    description: string;
    bg: string;
    fg: string;
    muted: string;
    accent: string;
    soft: string;
    line: string;
    secondary: string;
  }
> = {
  ocean: {
    name: "清澈蓝",
    description: "清晰、有序，适合工作汇报",
    bg: "#F7FAFF",
    fg: "#152A47",
    muted: "#69809D",
    accent: "#3865EE",
    soft: "#E8EEFF",
    line: "#DDE5F1",
    secondary: "#38B8A7",
  },
  paper: {
    name: "留白",
    description: "克制简洁，让观点成为主角",
    bg: "#FFFFFF",
    fg: "#23282F",
    muted: "#777E87",
    accent: "#267C68",
    soft: "#E9F3EE",
    line: "#E4E8E6",
    secondary: "#E3AB5C",
  },
  midnight: {
    name: "深空",
    description: "深色背景，适合提案与演讲",
    bg: "#162239",
    fg: "#F0F4FF",
    muted: "#A1AEC4",
    accent: "#9CB9FF",
    soft: "#243751",
    line: "#34445F",
    secondary: "#69D8BE",
  },
};
export const W = 1280,
  H = 720;
type TextNode = {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  color: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  lineHeight?: number;
};
type RectNode = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  radius?: number;
};
type ChartNode = {
  kind: "chart";
  x: number;
  y: number;
  w: number;
  h: number;
  data: ChartData;
};
export type SceneNode = TextNode | RectNode | ChartNode;

export function wrapText(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "",
      length = 0;
    for (const char of Array.from(paragraph)) {
      const weight =
        char.charCodeAt(0) > 255 ? 1 : /[MW@#%]/.test(char) ? 0.85 : 0.55;
      if (length + weight > width / fontSize && line) {
        lines.push(line);
        line = "";
        length = 0;
      }
      line += char;
      length += weight;
    }
    lines.push(line);
  }
  return lines;
}
export function layoutSlide(
  slide: Slide,
  themeId: ThemeId,
  index: number,
  total: number,
): SceneNode[] {
  const t = themes[themeId];
  const nodes: SceneNode[] = [];
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    radius = 0,
  ) => nodes.push({ kind: "rect", x, y, w, h, fill, radius });
  const text = (
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    color = t.fg,
    bold = false,
    align: TextNode["align"] = "left",
  ) =>
    nodes.push({
      kind: "text",
      text: value,
      x,
      y,
      w,
      h,
      size,
      color,
      bold,
      align,
    });
  rect(0, 0, W, H, t.bg);
  text("BRIEFDECK", 64, 36, 400, 24, 16, t.muted, true);
  text(
    `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    1090,
    650,
    126,
    24,
    16,
    t.muted,
    false,
    "right",
  );
  rect(64, 643, 1000, 1, t.line);
  if (slide.sourceIds.length)
    text(
      `材料引用 ${slide.sourceIds.join(" · ")}`,
      64,
      656,
      950,
      22,
      14,
      t.muted,
    );

  if (slide.layout === "cover") {
    rect(842, 0, 438, 642, t.soft);
    rect(942, 128, 200, 200, t.accent, 28);
    rect(1042, 240, 174, 174, t.secondary, 24);
    rect(898, 355, 120, 120, t.bg, 20);
    text(
      slide.subtitle || "A CLEARER WAY TO PRESENT",
      72,
      157,
      720,
      40,
      18,
      t.accent,
      true,
    );
    text(slide.title, 68, 223, 740, 230, 60, t.fg, true);
    text(slide.body.join("\n"), 72, 497, 690, 100, 25, t.muted);
  } else {
    text(slide.subtitle || "", 68, 100, 1100, 34, 19, t.accent, true);
    text(slide.title, 64, 150, 1150, 126, 44, t.fg, true);
    if (slide.layout === "big-point") {
      rect(64, 305, 7, 228, t.accent, 3);
      slide.body.forEach((b, i) =>
        text(
          b,
          102,
          315 + i * 88,
          1080,
          84,
          i ? 28 : 38,
          i ? t.muted : t.fg,
          !i,
        ),
      );
    }
    if (slide.layout === "bullets") {
      const row = Math.min(82, 326 / Math.max(1, slide.body.length));
      slide.body.forEach((b, i) => {
        rect(72, 302 + i * row, 8, 8, t.accent, 3);
        text(
          b,
          105,
          286 + i * row,
          1080,
          row - 2,
          slide.body.length > 5 ? 25 : 29,
        );
      });
    }
    if (slide.layout === "two-column") {
      const half = Math.ceil(slide.body.length / 2);
      [slide.body.slice(0, half), slide.body.slice(half)].forEach((col, c) => {
        const x = 64 + c * 592;
        rect(
          x,
          291,
          560,
          310,
          c ? t.soft : themeId === "midnight" ? "#1D2C43" : "#EFF3F8",
          18,
        );
        rect(x + 28, 323, 40, 4, c ? t.accent : t.secondary, 2);
        col.forEach((b, i) => text(b, x + 28, 355 + i * 74, 506, 72, 26));
      });
    }
    if (slide.layout === "timeline") {
      const count = Math.max(slide.body.length, 1),
        width = 1152 / count;
      rect(86, 355, 1060, 3, t.line);
      slide.body.forEach((b, i) => {
        const x = 64 + i * width,
          [label, ...rest] = b.split(/[｜|]/);
        rect(x + 20, 333, 48, 48, i ? t.soft : t.accent, 12);
        text(
          String(i + 1).padStart(2, "0"),
          x + 20,
          343,
          48,
          30,
          19,
          i ? t.accent : t.bg,
          true,
          "center",
        );
        text(label, x + 20, 408, width - 34, 80, 28, t.fg, true);
        text(rest.join("｜"), x + 20, 490, width - 34, 108, 22, t.muted);
      });
    }
    if (slide.layout === "chart" && slide.chart) {
      nodes.push({
        kind: "chart",
        x: 90,
        y: 286,
        w: 1080,
        h: 300,
        data: slide.chart,
      });
      text(slide.body[0] || "", 90, 602, 1080, 24, 15, t.muted);
    }
  }
  return nodes;
}

export function layoutWarnings(slide: Slide, theme: ThemeId): string[] {
  const nodes = layoutSlide(slide, theme, 0, 1);
  const warnings: string[] = [];
  for (const n of nodes) {
    if (n.kind !== "text") continue;
    if (wrapText(n.text, n.w, n.size).length * n.size * 1.4 > n.h + 8)
      warnings.push(`“${n.text.slice(0, 16)}”可能超出文本框，请精简或换版式。`);
  }
  if (slide.layout === "big-point" && slide.body.length > 3)
    warnings.push("核心结论页建议不超过三个观点。");
  if (slide.layout === "timeline" && slide.body.length > 5)
    warnings.push("时间线建议不超过五个阶段。");
  return [...new Set(warnings)];
}

function ChartPreview({ node, theme }: { node: ChartNode; theme: ThemeId }) {
  const t = themes[theme],
    colors = [t.accent, t.secondary];
  const { data, x, y, w, h } = node;
  const values = data.series.flatMap((s) => s.values),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const range = max - min,
    plotH = h - 64,
    baseline = y + (plotH * max) / range;
  const yy = (v: number) => y + ((max - v) / range) * plotH;
  const group = w / Math.max(data.labels.length, 1);
  return (
    <g>
      {[0, 0.5, 1].map((a) => (
        <line
          key={a}
          x1={x}
          x2={x + w}
          y1={y + a * plotH}
          y2={y + a * plotH}
          stroke={t.line}
        />
      ))}
      <line x1={x} x2={x + w} y1={baseline} y2={baseline} stroke={t.muted} />
      {data.series.map((s, si) => (
        <g key={si}>
          {data.type === "line" && (
            <polyline
              points={s.values
                .map((v, i) => `${x + group * (i + 0.5)},${yy(v)}`)
                .join(" ")}
              fill="none"
              stroke={colors[si]}
              strokeWidth="4"
            />
          )}
          {s.values.map((v, i) => {
            const bw = Math.min(100, (group * 0.6) / data.series.length),
              bx =
                x +
                group * (i + 0.5) +
                (si - data.series.length / 2) * (bw + 6);
            return (
              <g key={i}>
                {data.type === "bar" ? (
                  <rect
                    x={bx}
                    y={Math.min(yy(v), baseline)}
                    width={bw}
                    height={Math.max(2, Math.abs(baseline - yy(v)))}
                    fill={colors[si]}
                    rx="5"
                  />
                ) : (
                  <circle
                    cx={x + group * (i + 0.5)}
                    cy={yy(v)}
                    r="6"
                    fill={colors[si]}
                  />
                )}
                <text
                  x={data.type === "bar" ? bx + bw / 2 : x + group * (i + 0.5)}
                  y={v >= 0 ? yy(v) - 12 : yy(v) + 23}
                  fill={t.fg}
                  fontSize="20"
                  textAnchor="middle"
                >
                  {v}
                  {data.unit}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {data.labels.map((l, i) => (
        <text
          key={i}
          x={x + group * (i + 0.5)}
          y={y + plotH + 30}
          fill={t.muted}
          fontSize="19"
          textAnchor="middle"
        >
          {l}
        </text>
      ))}
      {data.series.length > 1 &&
        data.series.map((s, i) => (
          <text
            key={i}
            x={x + i * 300}
            y={y + h}
            fill={colors[i]}
            fontSize="17"
          >
            {s.name}
          </text>
        ))}
    </g>
  );
}

export function SlideView({
  slide,
  theme,
  index = 0,
  total = 8,
  className = "",
}: {
  slide: Slide;
  theme: ThemeId;
  index?: number;
  total?: number;
  className?: string;
}) {
  return (
    <svg
      className={`slide-svg ${className}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`第${index + 1}页：${slide.title}`}
      fontFamily="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif"
    >
      {layoutSlide(slide, theme, index, total).map((n, i) => {
        if (n.kind === "rect")
          return (
            <rect
              key={i}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              fill={n.fill}
              rx={n.radius}
            />
          );
        if (n.kind === "chart")
          return <ChartPreview key={i} node={n} theme={theme} />;
        const lines = wrapText(n.text, n.w, n.size);
        return (
          <text
            key={i}
            fill={n.color}
            fontSize={n.size}
            fontWeight={n.bold ? 700 : 400}
            textAnchor={
              n.align === "center"
                ? "middle"
                : n.align === "right"
                  ? "end"
                  : "start"
            }
          >
            {lines.map((line, j) => (
              <tspan
                key={j}
                x={
                  n.align === "center"
                    ? n.x + n.w / 2
                    : n.align === "right"
                      ? n.x + n.w
                      : n.x
                }
                y={n.y + n.size + j * n.size * 1.4}
              >
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

export function createPresentation(project: Project) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "BriefDeck";
  pptx.subject = project.brief.purpose;
  pptx.title = project.title;
  pptx.company = "BriefDeck";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
  };
  const t = themes[project.brief.theme];
  const hex = (s: string) => s.replace("#", "");
  project.slides.forEach((spec, index) => {
    const slide = pptx.addSlide();
    for (const n of layoutSlide(
      spec,
      project.brief.theme,
      index,
      project.slides.length,
    )) {
      const pos = { x: n.x / 96, y: n.y / 96, w: n.w / 96, h: n.h / 96 };
      if (n.kind === "rect") {
        slide.addShape(
          n.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
          {
            ...pos,
            fill: { color: hex(n.fill) },
            line: { color: hex(n.fill), transparency: 100 },
            radius: (n.radius || 0) / 96,
            rectRadius: (n.radius || 0) / 96,
          } as any,
        );
      } else if (n.kind === "text") {
        slide.addText(wrapText(n.text, n.w, n.size).join("\n"), {
          ...pos,
          fontFace: "Microsoft YaHei",
          fontSize: n.size * 0.75,
          bold: n.bold,
          color: hex(n.color),
          margin: 0,
          breakLine: false,
          valign: "top",
          align: n.align || "left",
          paraSpaceAfter: 0,
          lineSpacingMultiple: 1.4,
          fit: "shrink",
        });
      } else {
        slide.addChart(
          n.data.type === "bar" ? pptx.ChartType.bar : pptx.ChartType.line,
          n.data.series.map((s) => ({
            name: s.name,
            labels: n.data.labels,
            values: s.values,
          })),
          {
            ...pos,
            catAxisLabelFontFace: "Microsoft YaHei",
            catAxisLabelFontSize: 14,
            valAxisLabelFontSize: 12,
            catAxisLabelColor: hex(t.muted),
            valAxisLabelColor: hex(t.muted),
            showLegend: n.data.series.length > 1,
            showValue: true,
            dataLabelPosition: "outEnd",
            dataLabelColor: hex(t.fg),
            dataLabelFormatCode: n.data.unit === "%" ? '0"%"' : "0.##",
            showTitle: false,
            chartColors:
              n.data.series.length === 1
                ? [hex(t.accent)]
                : [hex(t.accent), hex(t.secondary)],
            showBorder: false,
            showCatName: false,
            showCatNameInLegend: false,
            showShadow: false,
            valGridLine: { color: hex(t.line), size: 1 },
            catAxisLineShow: false,
            valAxisLineShow: false,
            showMarker: true,
            legendColor: hex(t.fg),
            legendFontSize: 12,
            chartArea: { fill: { color: hex(t.bg) } },
            plotArea: { fill: { color: hex(t.bg) } },
          } as any,
        );
      }
    }
    slide.addNotes(
      `${spec.notes}${spec.sourceIds.length ? `\n\n材料引用：${spec.sourceIds.join(", ")}` : ""}${project.demo ? "\n演示项目，数据仅供示例。" : ""}`,
    );
  });
  return pptx;
}
