# DevLog — meatshell-app 开发日志

> 目的：记录每次开发过程中的错误、修复、技术决策和逻辑问题。
> 新 AI 会话开始时应先读取此文件以获取完整上下文。
> 每次会话结束前必须更新此文件。

---

## 2026-06-21 — UI 全面重构（Tabby 风格）

### 变更范围
- 16 个文件，+726/-261 行
- 从 Catppuccin Mocha 迁移到自建 Design Token 体系（对标 Tabby 终端）
- Commit: `48e52f9`

### 设计 Token 体系
- 5 层背景（base → surface → glass → elevated → overlay）
- 4 级文字（primary / secondary / heading / muted）
- 单 accent 蓝 `#4fadff`（全局唯一强调色）
- 3 种语义色（success / warning / danger，仅状态指示）
- 完整圆角/间距/字体/动画系统
- `[data-theme="light"]` 浅色主题覆盖

### 组件变更清单
- TitleBar: 36px 紧凑高度，标签页底部 2px accent 选中线，关闭按钮 hover 显隐
- Sidebar: 玻璃拟态（backdrop-filter blur），资源卡片 3px 阈值进度条
- TerminalView: 新 xterm 配色（#0d1117 基底，accent 蓝光标）
- StatusBar: 24px 紧凑，status-dot 状态圆点
- ResizablePanel: 4px 分割条，hover accent
- Dialog: 玻璃模糊 + shadow-xl + spring 动画
- Button: variant 重命名（default→primary），新增 ghost/destructive
- Input: 2px 透明边框 → focus 显现
- Tabs: bg-surface 基底，active 时 elevated

### 错误 11: hover:opacity-100! Tailwind 语法错误
- **现象**：`hover:opacity-100!` — 不正确的 important 修饰符位置
- **原因**：Tailwind v3.4 的 `!` important 修饰符必须在前面：`hover:!opacity-100`
- **解决**：改为 `hover:!opacity-100`
- **教训**：Tailwind v3.4 important 修饰符语法：`!` 在 utility 名称前，如 `!opacity-100` 或 `hover:!opacity-100`

### 错误 12: transition-all 违反设计规范
- **现象**：Sidebar.tsx 中 2 处使用了 `transition-all`
- **原因**：设计规范明确禁止 `transition: all`（性能问题）
- **解决**：改为 `transition-[width]` 和 `transition-[width,background-color]`

### 错误 13: shadcn 桥接 CSS 变量格式错误
- **现象**：`--color-border: rgba(255, 255, 255, 0.1)` 无法配合 `hsl(var(--color-border) / <alpha-value>)`
- **原因**：Tailwind 的 HSL 函数需要纯 HSL 数值，不能处理 rgba()
- **解决**：改为 `--color-border: 0 0% 100%`（等价的纯 HSL 值）

### 错误 14: useRef 泛型缺少 | null（React 18 兼容）
- **现象**：`useRef<HTMLDivElement>(null)` 会导致 `.current` 只读
- **原因**：React 18 + 新版 @types/react 中不带 `| null` 的 useRef 泛型参数使 .current 只读
- **解决**：改为 `useRef<HTMLDivElement | null>(null)`
- **教训**：始终使用 `useRef<T | null>(null)` 模式

### 错误 15: PowerShell 不支持 &&
- **现象**：`git add . && git commit` 报错 `标记“&&”不是此版本中的有效语句分隔符`
- **原因**：PowerShell 使用 `;` 而非 `&&` 连接命令
- **解决**：分开执行 git 命令

---

## 2026-06-20 — 项目基础建立

### 架构
- 单仓库：`meatshell-app/` 包含 `meatshell/`（Rust 库）+ `src-tauri/`（Tauri 壳）+ `src/`（React 前端）
- 状态管理：Zustand（sessionStore / uiStore / commandStore）
- UI 组件：shadcn/ui + Radix，Tailwind CSS
- 终端渲染：xterm.js 5.x

### 错误 1: aur-publish.yml 语法错误
- **现象**：`Unrecognized named-value: 'secrets'`
- **原因**：旧的 Slint 版本遗留的 AUR/release workflows
- **解决**：删除 `aur-publish.yml` 和 `release.yml`，只保留 `ci.yml`

### 错误 2: CI checkout 路径错误
- **现象**：`Repository path is not under working directory`
- **原因**：双仓库时 CI 需要检出两个 repo，路径不在工作区内
- **解决**：合并为单仓库后此问题消失

### 错误 3: npm ci 失败
- **现象**：`npm ci` 找不到 `package-lock.json`
- **原因**：本地未运行过 `npm install`，CI 用 `npm ci` 要求已有 lock 文件
- **解决**：CI 中改为 `npm install`
- **教训**：`.gitignore` 不要排除 `package-lock.json`

### 错误 4: react-i18next 版本号不存在
- **现象**：npm 找不到 `react-i18next@^14.1.4`
- **原因**：手写版本号不正确（该包没有 14.x 版本）
- **解决**：改为 `react-i18next@^15.1.3`，`i18next@^24.2.3`
- **教训**：写依赖版本前查 npm registry

### 错误 5: TypeScript 编译错误（vite.config.ts）
- **现象**：`Cannot find module 'path'`、`Cannot find name 'process'`、`Cannot find name '__dirname'`
- **原因**：node 类型未安装 + `noEmit: true` 和 `composite: true` 冲突
- **解决**：安装 `@types/node`，`tsconfig.node.json` 中 `noEmit: true` → `emitDeclarationOnly: true`

### 错误 6: vite.config.ts 类型推断错误（async）
- **现象**：`defineConfig(async () => ...)` 返回 `Promise<UserConfig>` 不被接受
- **原因**：Vite 的 `defineConfig` 不接受返回 Promise 的函数
- **解决**：去掉 `async`
- **教训**：不要给没用 `await` 的函数加 `async`

### 错误 7: vite.config.ts 类型推断错误（minify）
- **现象**：`build.minify` 类型 `string | boolean` 不兼容
- **原因**：三元表达式 `!x ? "esbuild" : false` 中被推断为宽泛 `string`
- **解决**：加 `as const`：`("esbuild" as const)`
- **教训**：Vite 6 类型检查严格，字面量需显式断言

### 错误 8: Rust crate 名错误
- **现象**：`cannot find module or crate 'meatshell_app_lib'`
- **原因**：Tauri 模板的占位符 `_lib` 没替换
- **解决**：`src-tauri/src/main.rs` 中 `meatshell_app_lib::run()` → `meatshell_app::run()`
- **教训**：Tauri 模板占位名必须替换为实际 crate 名

### 错误 9: Git rebase 冲突
- **现象**：push 被拒绝，rebase 时 `ci.yml` 和 `.gitignore` 冲突
- **原因**：CI 在 GitHub 上生成了图标文件，和本地提交冲突
- **解决**：`git checkout --ours` 接受本地版本，`git rebase --continue`
- **用户困难**：vim 退出操作 `Esc` → `:wq` → `Enter`

### 错误 10: TypeScript useRef 只读属性
- **现象**：`Cannot assign to 'current' because it is a read-only property`
- **原因**：`useRef<HTMLDivElement>(null)` 在 React 18 + 新版 @types/react 中 .current 只读
- **解决**：改为 `useRef<HTMLDivElement | null>(null)`
- **教训**：React 18 必须用 `useRef<T | null>(null)` 模式

### 提交 2: c2b4e10 — 弹窗不弹出（根因：拖拽吞掉 click）
- **现象**：点击标题栏 "+" 按钮无反应
- **根因**：TitleBar 的 `onMouseDown={startDrag}` 触发 `startDragging()`，原生窗口拖拽吞掉 click 事件
- **解决**："+ "按钮加 `onMouseDown={(e) => e.stopPropagation()}`
- **同时修复**：3 个弹窗统一改用 shadcn Dialog（Portal 渲染，不受 overflow:hidden 拦截）

---

## 平台/环境注意事项

- **本地无 Rust 环境**：所有编译在 GitHub CI 上进行
- **CI 结果**：https://github.com/zfloong/meatshell-app/actions
- **下载 exe**：CI 跑完 → 点进最新 run → Artifacts → `meatshell-win64.zip`
- **PowerShell**：不支持 `&&`，使用 `;` 或分开执行
- **Git 操作**：用户名 `zfloong`，仓库 `zfloong/meatshell-app`
- **vim 退出**：`Esc` → `:wq` → `Enter`

---

## TODO / 待做功能

| 优先级 | 功能 | 状态 |
|--------|------|------|
| 1 | SSH 密钥认证前端对话框 | 待做 |
| 2 | SFTP 面板 UI（后端已完成） | 待做 |
| 3 | 终端搜索/复制（xterm search addon） | 待做 |
| 4 | 远程系统监控 Sidebar 标签页 | 待做 |
| 5 | 等宽字体嵌入 | 待做 |
| 6 | 端口转发 UI（后端已完成） | 待做 |
| 7 | Light/Dark 主题切换入口 | 待做 |
| 8 | 会话拖拽排序 | 待做 |
