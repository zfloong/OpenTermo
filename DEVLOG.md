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

- **本地 Rust 环境**：rustc 1.96.0，可本地编译
- **CI 结果**：https://github.com/zfloong/meatshell-app/actions
- **下载 exe**：CI 跑完 → 点进最新 run → Artifacts → `meatshell-win64.zip`
- **PowerShell**：不支持 `&&`，使用 `;` 或分开执行
- **Git 操作**：用户名 `zfloong`，仓库 `zfloong/meatshell-app`
- **vim 退出**：`Esc` → `:wq` → `Enter`

---

## TODO / 待做功能

| 优先级 | 功能 | 状态 |
|--------|------|------|
| 1 | SSH 密钥认证前端对话框 | ✅ 已做（2026-06-21，文件选择 Browse 按钮 + 密钥密码字段） |
| 2 | SFTP 面板 UI（后端已完成） | ✅ 已做（FileExplorer 内嵌 SFTP，2026-06-21） |
| 3 | 终端搜索/复制（xterm search addon） | ✅ 已做（2026-06-21，Ctrl+F 搜索+历史+选择复制） |
| 4 | 远程系统监控 Sidebar 标签页 | ✅ 已做（移至 StatusBar 内联显示，2026-06-21） |
| 5 | 等宽字体嵌入 | ✅ 已做（2026-06-21，JetBrains Mono woff2 嵌入 "Meatshell Mono"） |
| 6 | 端口转发 UI（后端已完成） | ✅ 已做（2026-06-21，PortForwardPanel local/dynamic） |
| 7 | Light/Dark 主题切换入口 | 待做 |
| 8 | 会话拖拽排序 | ✅ 已做（2026-06-21，useDragSort 共享 hook，SessionManager + CommandPanel） |
| 9 | 侧边栏可拖拽宽度 | ✅ 已做（2026-06-21，160-400px） |
| 10 | 远端监控数据接入前端 | ✅ 已做（2026-06-21，remote-stats 事件） |
| 11 | 会话管理页面 | ✅ 已做（2026-06-21，编辑/删除/双击连接） |
| 12 | 连接即保存 | ✅ 已做（2026-06-21，Connect & Save） |
| 13 | 优雅断连（SSH_MSG_DISCONNECT） | ✅ 已做（2026-06-21） |
| 14 | 文件下载定位功能 | ✅ 已做（2026-06-21，explorer /select,） |
| 15 | 全页面汉化 | 待做 |
| 16 | 命令排序模式选择器（手动/最近使用/名称/分类） | 待做 |

---

## 2026-06-21 — 配色 + 侧边栏 + 远端监控

### 错误 16：颜色 Token 变化肉眼不可见
- **现象**：bg-base `#0d1117` → `#0a0e14` 仅差 3 个 RGB 点，用户完全看不出差异
- **原因**：所有背景色集中在 `#0a-#1a` 区间，人眼无法分辨
- **解决**：拉开层级间距，base `#0c1117` / surface `#18202a` / elevated `#222c38`（22 点差距），text 从 `#d4d4d4` 提到 `#e6eef5`
- **教训**：暗色主题中相邻层级必须有 ≥10 个 RGB 点的差距才肉眼可见

### 错误 17：远端监控数据被忽略
- **现象**：SSH 连接后 StatusBar 仍显示本地 CPU/内存
- **原因**：后端已在推送 `remote-stats:{tabId}` 事件，前端 `sessionStore._setupListener` 未监听
- **解决**：`sessionStore.ts` 新增 `RemoteStats` 类型 + `_setupListener` 监听 `remote-stats` + `ActiveTab.remoteStats` 字段；`StatusBar.tsx` 优先显示远端数据，无远端时 fallback 本地

### 错误 18：侧边栏固定宽度，不可拖拽
- **解决**：`uiStore` 新增 `sidebarWidth`/`savedSidebarWidth`/`setSidebarWidth`；`toggleSidebar` 改为宽 0 ↔ 上次宽；`Sidebar.tsx` 右侧加 4px 拖拽手柄（160-400px，<60 吸附关闭）

### 错误 19：按钮 hover 颜色使用旧 accent
- **现象**：`button.tsx` 中 `hover:bg-[rgba(79,173,255,...)]` 是旧 `#4fadff`
- **解决**：统一改为新 accent `rgba(96,165,250,...)`

### 错误 20：命令面板按钮太小（4 个按钮挤在 260px 侧边栏）
- **现象**：每条命令有 Pin(10px)/Send(12px)/Edit(10px)/Delete(10px) 四个按钮，命中区仅 ~14-18px
- **解决**：保留 Send(14px) 始终可见；Pin 改为左侧 2px accent 竖线指示器；Edit/Delete/Duplicate 全部移到右键 `ContextMenu` 组件

### 新增：右键菜单系统
- **新文件**：`src/components/ui/context-menu.tsx` — Portal 渲染的轻量级 ContextMenu，支持 separator/danger 样式，Escape+点击外部关闭
- **右击空白区域**：New Command / New Group / Paste
- **右击命令项**：Send / Edit / Duplicate / Pin|Unpin / Delete
- **右击分组标题**：New Command / Rename Group / Delete Group

### 新增：CommandEntry 图标 + 描述字段
- **Rust** `command.rs`：`CommandEntry` 加 `icon: Option<String>` + `description: Option<String>`（serde(default)，旧数据自动兼容）
- **前端** `tauriCommands.ts`：接口同步加字段
- **编辑弹窗**：emoji 单字符输入框 + description textarea
- **列表显示**：emoji 图标前置 + description 第二行灰色文本

### 决策：Emoji 图标
- **结论**：Unicode emoji 零开销（系统字体渲染、无额外依赖、无 bundle 体积增长），完全可行

---

## 2026-06-21 — 终端搜索 + 会话管理 + 端口转发 + 文件下载修复

### 新增功能

#### 端口转发面板 (PortForwardPanel)
- **文件**：`src/components/layout/PortForwardPanel.tsx`
- 支持 Local / Dynamic 两种转发类型
- 新建/删除/状态列表
- 后端命令：`start_forward` / `stop_forward` / `list_forwards`

#### 会话管理页面 (SessionManager)
- **文件**：`src/components/SessionManager.tsx`
- 分组管理、编辑/删除会话、双击连接、上次连接时间显示
- 数据持久化到 `sessions.json`

#### 终端搜索 (Ctrl+F)
- **依赖**：`xterm-addon-search`（⚠ 注意是 unscoped 命名，不是 `@xterm/addon-search`）
- **组件**：`TerminalView.tsx` 内浮动搜索条
- **功能**：输入框 + 历史下拉（localStorage 持久化，去重，20 条上限）+ ◀▶ 箭头翻页 + 绿/红点状态指示 + ✕ 关闭
- **实现**：`SearchAddon.findNext()` / `findPrevious()` / `clearDecorations()` + 50ms 去抖

#### 选择即复制
- **组件**：`TerminalView.tsx` mousedown/mouseup/mouseleave 事件监听
- **机制**：鼠标松开时读取 `xterm.getSelection()`，调用 `navigator.clipboard.writeText()`
- **反馈**：复制成功时选区背景闪绿 200ms（`cursor: #22c55e` 临时覆盖）

#### 连接即保存 (Connect & Save)
- **组件**：`ConnectDialog.tsx`，按钮 "Connect" → "Connect & Save"
- `handleConnect` 中自动调用 `saveSession(form)` 持久化

#### 优雅断连
- **文件**：`src-tauri/src/lib.rs` `on_window_event`
- 点击 ✕ 关闭 → `api.prevent_close()` → 遍历所有 session 发送 `SSH_MSG_DISCONNECT` + 清理 SFTP/PortForward → 250ms 等待 → `window.close()`
- **关键**：需要 `use tauri::Manager;` 才能使用 `window.state::<T>()`

#### 文件下载定位修复 + 下载目录迁移
- **Bug 根因**：前端 `FileExplorer.tsx` 用 `dir.replace(/\\/g, "/")` 把所有路径转为正斜杠，传给 `explorer /select,{path}` 后 Windows 解析错误，跳转目录少一级
- **修复**：`commands.rs` 的 `reveal_in_explorer` 在调用 `explorer` 前将路径转为反斜杠
- **下载目录**：从系统 Downloads（可能中文"下载"路径）改为 `D:\meatshell-downloads`，D 盘不存在时回退到 `%LOCALAPPDATA%\meatshell\downloads`
- **新增命令**：`get_download_dir`（Rust 端自动创建目录）

---

### 错误 21: xterm-addon-search 包名不一致
- **现象**：`package.json` 写 `@xterm/addon-search`（scoped 命名），`TerminalView.tsx` import `xterm-addon-search`（unscoped 命名）
- **原因**：xterm 5.x 的 search addon 有两个 npm 包——`@xterm/addon-search`（新 scoped）和 `xterm-addon-search`（旧 unscoped），互不兼容
- **解决**：统一为 `xterm-addon-search`（与项目其他 xterm 包风格一致）
- **教训**：安装 xterm addon 前确认项目的命名风格，scoped 和 unscoped 是两个不同包

### 错误 22: SessionHandle 构造字段缺失（serial.rs / telnet.rs）
- **现象**：`meatshell/src/ssh.rs` 的 `SessionHandle` 新增 `events` 和 `ssh_handle` 字段后，`serial.rs` 和 `telnet.rs` 的构造代码编译失败
- **原因**：改了结构体字段但没 grep 所有构造点
- **解决**：补全 `serial.rs` 和 `telnet.rs` 的 `SessionHandle` 构造
- **教训**：改 struct 字段时务必 `grep` 所有构造位置

### 错误 23: telnet.rs 缺 Arc 导入
- **现象**：`telnet.rs` 用了 `Arc` 但未导入
- **解决**：加 `use std::sync::Arc;`

### 错误 24: serial.rs 重复导入 Arc
- **现象**：`serial.rs` 已有 `use std::sync::{Arc, Mutex}`，又加了 `use std::sync::Arc;`
- **解决**：删除重复的单独导入

### 错误 25: session.rs 使用 uuid 但无依赖
- **现象**：`uuid::Uuid::new_v4()` 编译失败，uuid crate 未在 Cargo.toml 中声明
- **解决**：改用确定性 ID（如 `local:127.0.0.1:8080`），无需引入额外依赖

### 错误 26: session.rs 未使用 ClientHandler 导入
- **现象**：compile warning — unused import
- **解决**：删除该 import

### 错误 27: lib.rs 缺 use tauri::Manager
- **现象**：`window.state::<SessionManager>()` 编译失败 — method `state` not found
- **原因**：`state()` 方法来自 `tauri::Manager` trait，必须显式导入
- **解决**：添加 `use tauri::Manager;`

### 错误 28: icon.ico 缺失
- **现象**：`cargo check` 报 `icons/icon.ico` 缺失
- **原因**：原有 `icon.png` 是 70 字节空文件，`tauri.conf.json` 引用了不存在的 icon 文件
- **解决**：PowerShell 脚本生成 32x32 BMP-based ICO（蓝色 #3B82F6，4286 字节）；`tauri.conf.json` 精简 icon 引用为只含 `icon.ico`

### 错误 29: RC 编译器编码错误（仅沙箱）
- **现象**：CI/沙箱中 `embed_resource` 捕获 RC 编译器输出失败
- **原因**：中文 Windows RC 编译器输出中文 stdout，编码不兼容
- **影响**：仅影响沙箱环境，用户本地 `cargo check` 正常通过

### 错误 30: Node.js 环境缺失（用户本地）
- **现象**：`npm`/`pnpm` 均报 "无法将...项识别为 cmdlet"
- **解决**：指导安装 Node.js（[nodejs.org](https://nodejs.org)），勾选 "Add to PATH"，安装后新开 PowerShell
- **验证**：`node -v` + `npm -v`

### 错误 31: reveal_in_explorer 正斜杠路径
- **现象**：文件下载后点击"Show in folder"，Explorer 跳转目录少一级
- **根因**：前端 `FileExplorer.tsx` 用 `dir.replace(/\\/g, "/")` 将反斜杠全部转为正斜杠，构建的 `localPath` 如 `C:/Users/65451/Downloads/file.txt`，传给 `explorer /select,{path}` 后 Windows 正斜杠路径解析不完整
- **解决**：`commands.rs` 的 `reveal_in_explorer` 在 Windows 上先 `path.replace('/', "\\")` 再调用 explorer

### 错误 32: commands.rs 缺 use tauri::Manager
- **现象**：`get_download_dir` 中 `app.path()` 编译失败
- **原因**：`path()` 方法来自 `Manager` trait，需导入 `use tauri::{Manager, State};`

### 错误 33: PowerShell 不支持 heredoc（<<'EOF'）
- **现象**：`git commit -m "$(cat <<'EOF'..."` 在 PowerShell 中无输出
- **原因**：PowerShell 不支持 bash heredoc 语法
- **解决**：换用简短中文单行 commit message

### 功能：SSH 密钥认证前端完善（2026-06-21）
- **新依赖**：`tauri-plugin-dialog`（Rust + `@tauri-apps/plugin-dialog` npm）
- **ConnectDialog 变更**：
  - Private Key Path 旁加 `Browse` 按钮（`FolderOpen` 图标，调用 `@tauri-apps/plugin-dialog` `open()` 原生文件选择器，过滤 `.pem/.key/.ppk/id_*`）
  - Key 认证时显示 `Key Passphrase`（可选）输入框，替代 Password 栏位的 Proxy 字段
  - `handleConnect` / `handleSave` 在 key 认证时将 `keyPassphrase` 写入 `password` 字段（Rust 后端复用 password 作为密钥密码）

### 功能：等宽字体嵌入（2026-06-21）
- **字体**：JetBrains Mono（OFL 开源），Latin 子集 woff2 格式，~21KB
- **路径**：`public/fonts/jetbrains-mono-latin-400-normal.woff2`
- **CSS**：`index.css` 新增 `@font-face` 声明，family 名 `"Meatshell Mono"`
- **TerminalView**：xterm 默认 fontFamily 改为 `"'Meatshell Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace"`
- **`--font-mono`** CSS 变量同步更新
- **效果**：终端渲染不再依赖系统字体安装，所有机器显示一致

### 功能：拖拽排序（2026-06-21）
- **共享 Hook**：`src/hooks/useDragSort.ts` — HTML5 DnD `onDragStart/Over/Drop` 封装，返回 `{ dragging, dragOver, getDragProps }`
- **SessionManager**：拖拽 `GripVertical` 手柄排序，跨分组（通过 `reorder_sessions` 持久化到 `sessions.json`）
- **CommandPanel**：拖拽排序后所有同分类条目写入 `order` 字段（`reorder_commands` 持久化到 `commands.json`），有手动 order 时停用 `last_used` 自动排序
- **Rust**：`CommandEntry` 新增 `order: Option<usize>`，`CommandStore::reorder()`，`reorder_commands` / `reorder_sessions` Tauri 命令
- **视觉反馈**：拖拽中 30% 透明 + 目标位置 2px accent 顶部边框线

---

### 平台/环境注意事项（更新）

- **用户本地环境**：Windows 10/11，已安装 Node.js + Rust（rustc 1.96.0），可本地编译
- **cargo check 命令**：必须在项目根目录执行 `cargo check --manifest-path src-tauri\Cargo.toml`（Cargo.toml 在 src-tauri 子目录）
- **PowerShell git 提交**：不用 heredoc，用简短单行 commit message
