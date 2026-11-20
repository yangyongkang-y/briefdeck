# Anna staging 与 GitHub 发布手册

当前状态：本地候选版本 0.1.0；尚未在 Anna 创建 App，尚未创建 GitHub 远程仓库。

## 账号

1. 在 https://staging.anna.partners 注册并完成邮箱验证。
2. 记录题目提供的初始 CU，不能假定已到账。
3. 在 `/developer` 接受条款并激活开发者身份。
4. 执行 `npx anna-app login --host https://staging.anna.partners`，在浏览器完成设备登录。不要将密码或 PAT 写入仓库。
5. 执行 `npx anna-app whoami`，确认 host 为 staging。
6. 设置 handle：`npx anna-app account set-handle your-dev-handle --host https://staging.anna.partners`。

## 首次草稿与真实测试

```sh
npm ci
npm test
npm run build
npm run anna:validate
npx anna-app apps push --bundle-dir bundle --account https://staging.anna.partners
```

通过开发者控制台安装/打开草稿，按 `docs/test-report.md` 中待执行用例测试。

首次文件上传：记录 `files.upload_init` 返回 URL 的 **origin**，不记录完整签名 URL。将该 HTTPS origin 写入 manifest 的 `ui.bundle.external_origins` 后重建、重传，验证真实 PUT 与 `files.download`。保持精确 origin，不添加通配符。

真实测试优先一份中文八页（大纲一次、正文三次）和单页改写一次；每次记录实际模型、CU 和耗时。再根据成本决定英文、十二页等回归范围。达到 300 CU 复核预算，400 CU 停止新增实验，保留剩余额度用于必要修复。这个上限是开发预算，不是模型价格承诺。

## 商店与版本

完善 app.json：GitHub homepage、反馈链接、隐私链接、logo_file 与截图。示例截图不得冒充真实 AI 结果。

```sh
npx anna-app apps sync-meta --account https://staging.anna.partners
npx anna-app apps cut 0.1.0 --changelog "首版：大纲、编辑、单页改写和可编辑PPTX" --account https://staging.anna.partners
npx anna-app apps submit-review --account https://staging.anna.partners
npx anna-app apps status briefdeck --account https://staging.anna.partners
```

必须等管理员批准。批准后：

```sh
npx anna-app apps release 0.1.0 --account https://staging.anna.partners
npx anna-app apps status briefdeck --account https://staging.anna.partners
npx anna-app apps versions briefdeck --account https://staging.anna.partners
```

确认 `PUBLISHED`、正确版本与 `bundle_ready`。独立正常测试账号安装后完成新建、生成、编辑、保存和下载。不要仅凭本人草稿安装成功声称公开交付完成。

## GitHub

在已连接的 GitHub 身份下创建公开仓库 `briefdeck`，检查 `.gitignore` 排除 `.anna/`、node_modules、测试运行数据和任何密钥，再推送 main。提交后的构建、测试和 Anna bundle 应对应同一个 commit。

最终交付填写实际 GitHub URL、App name、slug、完整 `@handle/slug`、平台体验链接、发布版本、独立账号测试结果和实际 CU。
