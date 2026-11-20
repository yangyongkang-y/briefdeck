import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/deck.json", import.meta.url), "utf8"),
);

test("本地模式明确区分 AI；示例可编辑、切换主题、保存并导出原生 PPTX", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /生成演示大纲/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "体验示例", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "页面标题", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "页面标题", exact: true })
    .fill("这是我修改后的演示标题");
  await page.getByRole("button", { name: "主题", exact: true }).click();
  await page.getByRole("button", { name: "选择深空主题" }).click();
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await expect(
    page.getByText("已保存", { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /我的演示/ }).click();
  await page.locator(".project-cover").first().click();
  await expect(
    page.getByRole("textbox", { name: "页面标题", exact: true }),
  ).toHaveValue("这是我修改后的演示标题");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  if (
    await page
      .getByRole("button", { name: "继续导出" })
      .isVisible()
      .catch(() => false)
  )
    await page.getByRole("button", { name: "继续导出" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pptx$/);
  await file.saveAs("artifacts/browser-export.pptx");
  await page.screenshot({
    path: "artifacts/editor-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("375px 窗口可以编辑和查看页面，没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/create-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "体验示例", exact: true }).click();
  await page
    .getByRole("textbox", { name: "页面标题", exact: true })
    .fill("手机窗口也能编辑");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/editor-mobile.png",
    fullPage: true,
  });
});

test("通过实际 SDK 的 iframe 桥完成大纲、分批生成和单页改写（模拟宿主，非真实 AI）", async ({
  page,
}) => {
  await page.route("**/static/anna-apps/_sdk/latest/index.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript; charset=utf-8",
      body: readFileSync(
        "node_modules/@anna-ai/app-runtime/dist/index.js",
        "utf8",
      ),
    }),
  );
  const data = JSON.stringify(fixture).replace(/</g, "\\u003c");
  await page.route("**/test-harness", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe id="app" style="width:100%;height:100vh;border:0" src="/?wid=local-test-window&t=local-test-token"></iframe><script>
  const deck=${data}; const entries=new Map(); let n=0;window.requests=[];
  window.addEventListener('message', async e=>{const m=e.data;if(m.kind!=='req')return;let result={};const a=m.args||{};try{
    if(m.ns==='window'&&m.method==='hello') result={capabilities:{host_api_version:'test'},view_meta:{title:'BriefDeck',name:'main'},entry_payload:{},runtime_state:{},app:{id:1,slug:'briefdeck'}};
    if(m.ns==='storage'){
      if(m.method==='get')result={exists:entries.has(a.key),...entries.get(a.key)};
      if(m.method==='set'){const etag=String(++n);entries.set(a.key,{value:a.value,etag});result={etag};}
      if(m.method==='list')result={items:[...entries.keys()].filter(k=>k.startsWith(a.prefix||'')).map(key=>({key})),next_cursor:null};
      if(m.method==='delete')entries.delete(a.key);
    }
    if(m.ns==='llm'){
      window.requests.push(a);const input=JSON.parse(a.messages[0].content.text);let output;
      if(input.batch)output={slides:input.batch.map(b=>({...deck.slides.find(s=>s.id===b.id),title:b.title}))};
      else if(input.instruction)output={...input.slide,title:'更清晰的核心观点'};
      else output={slides:deck.outline};
      result={role:'assistant',content:{type:'text',text:JSON.stringify(output)},model:'test-host-fixture',stopReason:'endTurn',usage:{inputTokens:10,outputTokens:20,totalTokens:30},_meta:{quotaConsumed:0}};
    }
    e.source.postMessage({kind:'res',wid:m.wid,id:m.id,result},e.origin);
  }catch(error){e.source.postMessage({kind:'res',wid:m.wid,id:m.id,error:{code:'test_error',message:error.message}},e.origin);}});
  </script></body></html>`,
    }),
  );
  await page.goto("/test-harness");
  const app = page.frameLocator("#app");
  await app
    .getByRole("textbox", { name: /演示主题/ })
    .fill("一次真实流程的模拟宿主测试");
  await expect(app.getByRole("button", { name: /生成演示大纲/ })).toBeEnabled();
  await app.getByRole("button", { name: /生成演示大纲/ }).click();
  await expect(
    app.getByRole("textbox", { name: "第1页标题", exact: true }),
  ).toBeVisible();
  await app
    .getByRole("textbox", { name: "第1页标题", exact: true })
    .fill("我确认的大纲标题");
  await app.getByRole("button", { name: "确认大纲，生成 PPT" }).click();
  await expect(
    app.getByRole("textbox", { name: "页面标题", exact: true }),
  ).toHaveValue("我确认的大纲标题");
  await app.getByRole("button", { name: "AI 改写", exact: true }).click();
  await app.getByRole("textbox", { name: "你的调整要求" }).fill("突出结论");
  await app.getByRole("button", { name: "生成改写预览" }).click();
  await expect(
    app.getByRole("heading", { name: "更清晰的核心观点" }),
  ).toBeVisible();
  await app.getByRole("button", { name: "应用", exact: true }).click();
  await app.getByRole("button", { name: "内容", exact: true }).click();
  await expect(
    app.getByRole("textbox", { name: "页面标题", exact: true }),
  ).toHaveValue("更清晰的核心观点");
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(5);
  await page.screenshot({ path: "artifacts/sdk-workflow.png", fullPage: true });
});
