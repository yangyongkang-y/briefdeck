# BriefDeck 0.1.0 验证记录

日期：2026-11-20（Asia/Shanghai）。所有「通过」均为实际运行结果，未执行项目单独标记。

## 已通过

| 范围 | 方法与结果 |
| --- | --- |
| 类型与构建 | TypeScript 检查、Vite production 构建成功 |
| Anna manifest | 官方 CLI 0.1.64 schema 4 验证通过；最终状态见终端记录 |
| 依赖 | 调整至修复版本后，npm audit 为 0 vulnerabilities |
| 核心测试 | Vitest：18 项通过，覆盖 JSON、截断、引用、图表数字、页面 ID、三主题布局、PPTX 结构、APS 快照、并发冲突与平台文件上传顺序 |
| 桌面浏览器 | Chrome：打开示例、修改标题、主题切换、保存、刷新恢复、PPTX 下载，无 pageerror |
| 窄窗口 | Chrome 375×812：创建及编辑器无文档横向溢出，输入与编辑可用 |
| SDK 编排 | 使用实际 Anna SDK 0.28.0 与动态模拟 iframe 宿主：大纲 → 用户确认 → 三批页面 → 单页改写预览 → 应用，共 5 次固定响应调用 |
| 官方开发宿主 | 官方 Anna CLI + anna-app-runtime-local 0.2.0a33 成功启动，SDK hello/ready、storage.list 与八页固定大纲流程成功（不是真实模型） |
| 导出结构 | 八页 XML、八份讲稿、原生 chart 资源及原生文本对象，整页图片为零 |
| 办公软件读取 | LibreOfficeDev 26.8.0.0.alpha0 成功打开浏览器下载的八页 PPTX 并导出八页 PDF |
| 导出视觉 | 配置系统中文字体回退后，检查封面及原生图表页，中文显示完整、图表 42%/68% 与样例一致 |

## 已修复的实际问题

- Playwright ESM 中 JSON 模块导入方式不兼容：改为 Node fs 读取。
- 模拟宿主 HTML 缺少 UTF-8 声明导致固定响应中文乱码：明确 charset。
- 同一窗口自动保存与生成保存可能并发：Repository 层串行化保存。
- 老版本测试依赖与 image-size 存在已知漏洞：更新受影响依赖并锁定 image-size 2.1.0。
- 原先方案中的 `--llm real/mock` 与安装的 CLI 不符：按 `--help` 改用受支持的参数。
- 将宿主 SDK 打包入 UI 导致静态检查误报麦克风权限：改为在 Anna iframe 内动态加载平台 SDK，独立预览不加载宿主模块。
- LibreOffice 的默认 Fontconfig 未找到中文回退字体：用独立 QA Fontconfig 指向 macOS 系统字体，不修改导出文字为图片。

## 待真实 staging 验证

| 用例 | 状态 |
| --- | --- |
| 注册、验证邮箱、1000 CU 到账 | 未执行，需要账号所有者配合 |
| 开发者身份激活与 CLI 设备登录 | 未完成；首次设备码未确认，已过期 |
| 中文八页真实生成、单页改写 | 未执行；没有真实 AI 消耗记录 |
| 英文、十二页、模型失败路径 | 仅本地边界测试，真实模型待测 |
| APS 跨窗口、跨会话恢复 | 模拟存储验证通过，真实 APS 待测 |
| 文件上传 origin / CSP 与宿主下载 | 待真实 staging 返回 URL 后配置并验收 |
| 独立账号安装与数据隔离 | 待公开版本 |
| Windows PowerPoint / WPS 人工检查 | 未执行 |
| Anna 管理员审核与 PUBLISHED 状态 | 尚未提交 |
| GitHub 远程仓库、远程 CI | 已发布公开仓库，远程 HEAD 与本地初始提交一致；远程 CI 结果待核验 |

模拟宿主测试不是平台真实测试，LibreOffice 验证不等于所有 PowerPoint/WPS 环境兼容。发布完成后应补充实际版本、commit、平台链接、模型、费用和真实截图。
