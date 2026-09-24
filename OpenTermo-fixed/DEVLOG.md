

## 2026-06-23 — 命令面板编辑对话框（原文已损坏，见下）

> ⚠️ **本节原始中文文本已在早期编码事故中丢失**（文件里只剩 `?`，git 全部历史版本都一样，无法还原）。
> 下面只保留可核实的事实，不再复述丢失的细节。

- 涉及文件：`src/components/CommandPanel.tsx` 的 `CommandEditDialog`（该文件与对话框**至今存在**）。
- 本次改动的功能面（可核实）：命令条目新增 `icon` 字段（JSON 导入导出携带）、标签 `label` 的回退规则、对话框的若干交互调整（快捷键/焦点/排序选项）。
- 教训（与第 31 行「编码警告」同源）：**不要用 PowerShell 处理含中文的文件**；当时的做法是手写 `\uXXXX` 转义，这个做法本身也是后来乱码的直接原因之一。

---

## 2026-06-23 — Encoding Warning (编码警告)

### 所有含中文的源文件必须是 UTF-8 without BOM

> ⚠️ **本节与下方 2026-07-12「编码加固」一节的 BOM 结论互相矛盾，两条都不要再照做。**
> 实际约束与现状（2026-09-24 核对）：
> - **硬约束只有一条：JSON 绝不能带 BOM**（`tauri.conf.json`、`capabilities/*.json`）——`serde_json` 与 PostCSS 都会报 `expected value at line 1`。
> - TS/TSX/Rust/CSS 带不带 BOM 都能正常构建；但**编辑工具会按自己的默认行为写盘**，
>   所以 2026-07-12 那次「25 个文件统一加 BOM」已被后续若干次编辑（含 Vzfl2.9）**部分回退**，仓库当前是混合状态。
> - **不要再批量加 BOM，也不要批量清理**——两种都能跑，反复横跳只会制造巨大的无意义 diff。
> - 真正要守住的纪律是：**不要用 PowerShell 的 `Get-Content` / `Set-Content` / `-replace` 处理含中文的文件**（见下）。

**切勿使用 PowerShell 操作含中文的文件。用 Python + `encoding='utf-8'` 代替。**

**会出问题的操作：**
- `[System.IO.File]::ReadAllText($path)` — .NET Framework 下对无 BOM 的 UTF-8 文件会用系统默认编码(GBK)误读，中文全部损坏
- `Set-Content -Encoding utf8` / `Out-File -Encoding UTF8` — 写入时添加 BOM，导致 Rust 构建报错 `expected value at line 1`
- PowerShell `-replace` 操作含中文的字符串 — 可能损坏编码

**正确操作：**
```python
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
# 修改 content...
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
```

**含中文的源文件列表：不再手工维护——它一定会过时。**（2026-09-24 核对：这份清单里的 `SessionManager.tsx` 已在 Vzfl2.8 删除，另有一批新文件从未入列。）
要判断某个文件是否含中文，直接查：

```bash
# 列出所有含 CJK 字符的源文件
grep -rlP '[\x{4e00}-\x{9fff}]' --include='*.ts' --include='*.tsx' --include='*.rs' --include='*.css' --include='*.html' .
```

**当前事实（2026-09-24）**：含中文的文件已经**不止源文件**——`DEVLOG.md` 自己的第 1~26、59~104 行就死在早期编码事故里（只剩 `?`，git 全历史无法还原，见本节上方说明）。**这就是"再也不要让中文经过 PowerShell"最有力的证据。**

### CommandPanel.tsx 乱码已修复

原始源文件中部分 Unicode 符号 (✓ 等) 在 git 传输中丢失变成 `??`。已修复为正常中文和 Unicode 字符。
（⚠️ 同一批次的其他段落没能救回来，见上方 01~12 行与本段下方。）
﻿


## 2026-06-23 — 右键菜单排序模式 / Unicode 图标（原文已损坏，见下）

> ⚠️ **本节原始中文文本同样在早期编码事故中丢失**（文件里只剩 `?`，git 全部历史版本都一样，无法还原）。
> 下面只保留可从代码与灰度残留推断出的事实，不再复述丢失的细节。

- 涉及文件：`src/components/CommandPanel.tsx`（右键菜单 + 排序逻辑）、`src/components/ui/context-menu.tsx`（菜单项支持图标）。
- 改动面（可核实）：
  - 命令集新增/调整了**排序模式**（`sortMode`，持久化键 `localStorage["cmd-sort"]`）：`Sort: Name`（按名称）/ `Sort: Last Used`（按最近使用）。
  - 菜单项支持带图标（`icon`），用到 `lucide-react` 的 `CheckSquare` / `Square` 作为**单选态**标记。
- 注：`Sort: Last Used` 所依赖的「使用次数统计」已在 **Vzfl2.2 被整体移除**（见下），因此这条排序模式是否仍生效，需以当前代码为准。
- 教训（同上方编码警告）：**Unicode 与中文符号不要经过 PowerShell**，用显式 UTF-8 的编辑器 / Python 处理。


## 2026-07-12 — Vzfl2.2 导出修复 + 编码加固

### 修复
- 导出全部命令 — 修复因缺少 Rust 后端 `write_text_file` 命令导致的调用失败
- 导出文件夹（右键） — 从静默浏览器下载改为系统存盘对话框，用户可选择保存位置
- SettingsPanel.tsx 编码损坏 — 恢复 git 版本，修复之前被 PowerShell 意外损坏的编码

### 编码加固（全量扫描）
- 所有 25 个无 BOM 的源文件统一添加 UTF-8 BOM，防止 PowerShell 误判为 ANSI/GBK
- `tauri.conf.json` 和 `capabilities/default.json` 除外（Rust serde_json 不兼容 BOM）
- 编码检查确认 0 个文件存在损坏

### 教训
- **永远不要用 PowerShell 的 `Get-Content` / `Set-Content` 处理含中文的源文件**
- 文件编辑必须用 Python 显式指定 `encoding='utf-8'`，避免系统默认编码(GBK)污染
- 后续所有代码修改优先通过 Python 脚本或编辑器，杜绝 PowerShell 管道写回

### 改动文件
- `src-tauri/src/commands.rs` — 新增 `write_text_file` 命令
- `src-tauri/src/lib.rs` — 注册 `write_text_file`
- `src/components/CommandPanel.tsx` — 导出文件夹改用 save() 对话框
- `src/components/SettingsPanel.tsx` — 从 git 恢复编码
- 25 个源文件（.ts/.tsx/.rs/.css/.html/.js）— 添加 UTF-8 BOM


---

## 2026-07-12 — Vzfl2.2 后续修复 + 经验教训

### 修复
- 命令面板搜索框已删除（无使用场景）　→ ⚠️ **此决定已在 Vzfl2.9 回退**：搜索框重新引入，且承担"37 条命令"这类总数提示（作为 placeholder）。见下方 Vzfl2.9 条目。
- 会话面板搜索框已删除（无使用场景）　→ ⚠️ **同样已回退**：Vzfl2.8 启动台（`SessionLauncher.tsx`）重新带上了搜索框。
- Star 图标增加 fill 属性，从空心边框变为实心金色填充
- 命令面板白天模式对比度修复（使用次数/命令数徽标/子文件夹标签）

### 统计功能移除
- 删除命令使用次数记录功能（usageCounts/recordUsage）
- 简化 commandStore，移除 localStorage 存储的计数逻辑
- 命令卡片 UI 删除次数显示

### ⚠️ 重要教训：文件修改的正确方式

#### 错误做法（每次都搞崩编码）
```
# ❌ PowerShell 管道传 Python 脚本
$script | Out-File -Path file.py -Encoding utf8
python file.py               # 脚本中 `escape` 被 PowerShell 拦截

# ❌ Python -c 传含中文/复杂表达式的代码
python -c "import os; ..."   # -- 被 PowerShell 解析为递减运算符

# ❌ Python replace 假设 \n 但文件是 \r\n
text.replace('abc\n', 'xyz')  # 实际匹配的是 'abc\r\n'，替换失败
```

#### 正确做法
```
// ✅ 用 Node 一行脚本直接操作文件（不经 PowerShell 转义）
node -e "const fs=require('fs');const p=process.argv[1];let t=fs.readFileSync(p,'utf8');/* 改 t */fs.writeFileSync(p,t,'utf8')" <file>

// ✅ 或写入独立 .py 文件后用 python 执行（不用管道传递）
// 文件内容显式 encoding='utf-8'，不含 \n
```

> 📌 2026-09-24 附注：本节原引用的是 `mcp__node_repl__js`（当时的 Node REPL MCP 工具），**该工具已不存在**。当前实际做法是**直接用编辑器的精确字符串替换**（Edit 工具），必要时才落 `node -e` / 独立 `.py`。核心纪律不变：**别让中文进 PowerShell 管道**。

#### 核心原则
1. **永远不要用 PowerShell 管道传代码给 Python** — \n、-- 等都会被 PowerShell 拦截
2. **优先用 Node.js REPL 改文件** — 编码可控，无转义问题
3. **CRLF/\r\n 要小心** — 替换前先 normalize 为 \n
4. **JSON 文件绝不能加 BOM** — serde_json 不兼容，PostCSS 也不兼容


---

## 2026-09-23 — Vzfl2.8：主题三档 / 弹窗自绘 / 启动台 / 分组排序 / 中文排版

> 本条目覆盖 Vzfl2.7 之后到 Vzfl2.8 的全部改动（一天内五个批次，逐批 tsc + build + 桩件 harness + 用户 `tauri dev` 目视验收）。

### 一、新增功能

**1. 主题从两档扩到三档：夜晚 / 白天 / 自定义**
- `settingsStore.ts`：`ThemeId = PresetThemeId | "custom"`，新增 `THEME_ORDER`、`THEME_LABELS`（设置面板与标题栏循环切主题共用同一张表）、`customBase`（自定义档的基底色板）、`customAccent`（hex，空串＝跟随基底）。
- `themeUtils.ts`：`resolvePalette()`（自定义＝基底色板 + 覆盖强调色，其余 token 不开放）、`effectivePreset(theme, customBase)`、`THEME_ACCENT_HEX`。`data-theme` 与终端 ANSI 都走 `effectivePreset`，所以自定义档的终端配色跟它的基底一致。
- **每个预设有自己的透明度默认档**：`THEME_ALPHA_DEFAULTS`（暗＝窗口 20% / 终端区 80%，白天＝窗口 95% / 终端区 20%），切到预设时按表改写；`custom` 档没有默认值——它的定义就是"永不改写"。
- 自定义档的四个滑杆值单独存 `opentermo-custom-appearance`（JSON）：**进入自定义时回灌、离开时快照**；重启后仍停在自定义则不动全局键。窗口/终端透明度本身仍是全局单值，不按主题分存。
- `TitleBar.tsx`：主题按钮从两态 toggle 改为按 `THEME_ORDER` 三态循环，自定义档显示 `Palette` 图标，title 文案取 `THEME_LABELS[nextTheme]`。

**2. 会话面板 → 启动台（浮层）**
- 新增 `src/components/SessionLauncher.tsx`（767 行），**删除 `SessionManager.tsx`（422 行）**；入口为标题栏 `+` 与 `Ctrl+Shift+T`（`uiStore` 加 `isLauncherOpen/openLauncher/closeLauncher`，`App.tsx` 挂快捷键并渲染 `<SessionLauncher />`）。
- 层级：启动台 `z-40`，低于 radix Dialog 的 `z-50` 与 ContextMenu 的 `z-100` —— 从启动台里弹出的确认/编辑框不会被它挡住，context-menu 也无需特殊处理。
- 卡片第二行只显示 host（串口会话显示串口名），搜索平铺行同步精简、右侧保留分组标签；复制按钮常驻可见（不是 hover 才出现）。
- 组头右键：在此新建连接 / 折叠·展开 / 上移 / 下移 / 按名称重排 / 重命名 / 删除分组；卡片右键：连接 / 编辑 / 移动到分组 / 重命名 / 删除。

**3. 分组手动排序（第一步，纯前端）**
- 新增 `src/lib/sessionGroups.ts`（61 行）：**显示顺序 = 名册数组本身的顺序**，复用已有的 localStorage 键 `opentermo-known-groups`，不新增存储键、无需迁移。
- `orderGroups(names, roster)` 是**唯一顺序出口**（启动台托盘、对话框下拉、卡片"移动到分组"三处共用），契约："名册里的组一定在场"；未注册的组按名称排在名册之后；`Default` 是保留组，永远首位、不参与移动、永不写进名册。
- `movableGroups()` 给"上移/下移/按名称重排"用；`registerKnownGroup()` 追加到末尾。
- 已知取舍（升级后会看到的）：① 首次打开按**注册顺序**而非字母序（点组头右键"按名称重排"归位）；② 移动一个从未注册过的组会把它写进名册，之后即使清空也保留为空托盘；③ 名册只存本机，**不随会话导入/导出走**（"分组作为一等对象"这条明确不做）。
- 拖拽排序（第二步）未做，当前只有右键。

**4. "新建分组"入口打通（此前同类能力入口不对称）**
- 启动台头部并排「新建连接 / 新建分组」两个可见按钮；组头右键「在此新建连接」会把新会话预置进该组；对话框内就地新建。
- 新增 `src/components/GroupField.tsx`（66 行）：ConnectDialog 与 EditSessionDialog 共用的"下拉 + 就地新建"控件，选项含**空分组**（此前只显示"已有会话的分组"，空分组看不见也选不中）。
- `sessionStore.ts`：`openConnectDialog(group?)` + `connectDialogGroup` 状态，`App.tsx` 以 `defaultGroup` 传给 ConnectDialog。

### 二、Bug 修复

- **关于页版本号硬编码**：`SettingsPanel.tsx` 写死 `v2.5.0`，实际已是 2.7.0。改为运行时 `getVersion()`（`@tauri-apps/api/app`），以后不需要有人记得去改这行。
- **对话框预置分组被 select 吞掉**：`defaultGroup` 传入的分组若不在 `<option>` 列表里，select 显示 Default 而 state 是那个不存在的组名 → 保存后分组丢失。`GroupField` 的选项集合现在一定包含当前值。
- **启动台读不到弹窗里新建的分组**：`SessionLauncher` 常驻挂载，弹窗只写了 localStorage 名册，不会触发它重读 → 打开启动台时补一次 `setKnownGroups(loadGroupOrder())`。
- **「移动到分组」子菜单可能没有 Default**：`sessionCtx` 的组名集合现在固定并入 `RESERVED_GROUP`。
- **新建分组重名**：启动台与对话框两处都用 `groupExists` / `options.includes` 拦住，并用自绘 `alertMessage` 说明原因（原来靠浏览器原生弹窗）。
- **中文按钮忽细忽粗**（"看起来很老旧"）：根因是**微软雅黑只有 300/400/700 三个字重**，`font-medium`(500) 掉回常规、`font-semibold`(600) 硬跳到粗体，所以同一对按钮一个细一个突兀。修复：`--font-ui` 中文侧插入 `Noto Sans SC`（思源黑体，本机已装，有真 400/500/700；未安装的机器自动回退 `system-ui`），并把启动台两颗头部按钮统一到 `text-sm` + `font-semibold`。拉丁字体仍是 Segoe UI Variable，未改。
- **`tailwind.config.ts` 里那份 Inter 字体栈从未生效**，与 `index.css` 的 `--font-ui` 构成第二个声明点：`fontFamily.sans` 改为 `["var(--font-ui)"]`，字体栈回到单一来源（已验证产物 CSS 输出 `font-family:var(--font-ui)`）。

### 三、删除的遗留代码

- `src/components/SessionManager.tsx` — 整文件 422 行（能力全部迁进启动台；同时消灭"两套并存的会话 UI"）。
- `ConnectDialog.tsx` 的 `onDelete` prop + `handleDeleteSession` + `Trash2` 图标 — 连接面板从来不渲染删除按钮，是死接口。
- `ConnectDialog.tsx` 的 `groupOptions` useMemo 与内联分组 select — 并入 `GroupField`。
- `sessionGroups.ts` 早期的 `loadKnownGroups` / `saveKnownGroups` / `knownGroupList` 三函数 API — 被 `loadGroupOrder` / `saveGroupOrder` / `orderGroups` / `movableGroups` / `registerKnownGroup` 取代。
- `tailwind.config.ts` 的死 Inter 字体栈（见上）。
- 启动台页脚「空白右键：新建分组」提示 — 入口已有可见按钮，不需要再教一遍隐藏手势。
- 全项目原生 `confirm()` / `prompt()`：**0 残留**（本日之前 8 处，全部换成 `src/components/ui/confirm-dialog.tsx` 的 `confirmAction` / `promptText` / `alertMessage` + `ConfirmDialogHost`）。唯一还留原生弹窗的地方是 xterm 的 OSC-8 超链接确认（属终端库内部，不在范围）。

### 四、改动文件

| 文件 | 变化 |
| --- | --- |
| `src/components/SessionLauncher.tsx` | 新增 767 行 |
| `src/components/ui/confirm-dialog.tsx` | 新增 170 行 |
| `src/components/GroupField.tsx` | 新增 66 行 |
| `src/lib/sessionGroups.ts` | 新增 61 行 |
| `src/components/SessionManager.tsx` | 删除 422 行 |
| `src/stores/settingsStore.ts` | +125（主题三档、自定义槽、透明度默认表） |
| `src/components/SettingsPanel.tsx` | +69（主题页、自定义取色、关于页动态版本） |
| `src/lib/themeUtils.ts` | +41（resolvePalette / effectivePreset / THEME_ACCENT_HEX） |
| `src/App.tsx` `src/components/CommandPanel.tsx` `ConnectDialog.tsx` `EditSessionDialog.tsx` `layout/Sidebar.tsx` `layout/TerminalView.tsx` `layout/TitleBar.tsx` `stores/sessionStore.ts` `stores/uiStore.ts` `index.css` `tailwind.config.ts` | 各 +4 ~ +40 行 |
| 合计 | 已跟踪文件 +357 / −542，另新增 4 个文件 1,064 行 |

### 五、踩坑记录（后来的人别再踩）

1. **给已有函数加可选参数时，JSX 里 `onClick={fn}` 会把事件对象当参数传进去**（本例 `openConnectDialog(group?)`），而 `strictFunctionTypes` 竟不报错。必须写 `onClick={() => fn()}`。
2. **改一个函数的语义时别按"在场才显示"想当然**：`orderGroups` 第一版按在场过滤名册，直接导致对话框下拉丢掉空分组（harness 当场报 2 条 FAIL）。它的契约是"名册里的组一定在场"。
3. **`orderGroups` 显式吃 `roster` 参数不是多余的**：`setKnownGroups` 之后 localStorage 还没写（effect 未 flush），组件必须按 state 渲染，不能在渲染函数里读 localStorage。
4. **IDE/钩子推来的 TS 诊断经常是陈旧快照**（本轮 App.tsx 那条 "defaultGroup 不存在" 连报五六轮，实为 0 错）。一律以 `npx tsc -b --force` + `npm run build` 仲裁，别照着钩子报错回改代码。
5. **同一文件的多步编辑要一次写到位**：中间态被 Vite watcher 抓到就会出现"控件渲染正常但 onChange 是 undefined"这类假 bug（2026-09-22 磨砂滑块事故）。
6. **单实例插件让 dev 与正式版互斥**：正式版在跑时起 dev，dev 编译完直接退出去聚焦旧窗口。停后台任务也不会杀 vite/opentermo，要 `taskkill //F //PID`（Git Bash 里双斜杠逃逸）补杀。

### 六、验证方式

- `npx tsc -b --force` 干净；`npm run build` 干净（1688 modules，dist CSS 36.54 kB）。
- 桩件 harness（React/zustand/lucide/tauri 全部桩掉，esbuild 打包真组件，走渲染树断言）：`verify-launcher` **129 条断言**（[1]-[18]，含分组顺序、上移/下移边界 disabled、Default 首位不动、按名称重排、卡片右键子菜单同序）、`verify-group-select` **18 条**（下拉含空分组、预置分组不被吞、对话框内新建分组）。脚本在 `%TEMP%\ot-verify\`（一次性工具，未入库）。
- 目视验收：用户 `npm run tauri dev` 逐批确认；Z 轴叠放次序（弹窗压在启动台之上、右键菜单最上）只有真机能判，桩件断言不了。

### 七、本版本有意未做

- 分组**拖拽**排序（第二步）—— 先上看得到、可点的手动排序。
- 分组作为一等对象（独立存储、随导入导出走）—— 名册只在当前机器。
- 侧栏命令面板展开区"层级糊"—— ✅ **已在 Vzfl2.9 完成**（见下）。
- `animate-scale-in` 死类是否清掉 —— 待拍板。
- xterm OSC-8 链接的原生确认框 —— 终端库内部行为。
- 打包分发字体（把 Noto Sans SC subset 进 `public/fonts/`）—— 现在只是"引用本机已装字体"，别人机器上没有就回退雅黑；真要保证跨机一致得下载 woff2 子集进仓库（OFL 允许随包分发），约 0.9–1.5 MB/字重。


---

## 2026-09-23/24 — Vzfl2.9：终端交互对齐 / 命令面板层级重建 / 内核三处修复 / 文档修补

> 标签 `Vzfl2.9`；发布链路 = push `zfl` 或标签 `Vzfl*` → CI 构建 → 打 tag 时发 Release（`.github/workflows/ci.yml`）。
> commit：`c1ad400`（内核 + UI）、`63ffdb3`（版本号 2.8.0 → 2.9.0）。

### 一、终端交互对齐 Ubuntu/GNOME Terminal

`src/components/layout/TerminalView.tsx`：

- **复制**：`Ctrl+Shift+C` 与 `Ctrl+Insert`；**粘贴**：`Ctrl+Shift+V` / `Shift+Insert` / **鼠标中键**。
- **中断恒为 SIGINT**：`Ctrl+C` 不再被任何自定义逻辑截走，永远发给 PTY（这是与"选中即复制"类终端最本质的区别）。
- **查找**：`Ctrl+Shift+F`（xterm-search addon）；**缩放**：`Ctrl+Shift++` / `-` / `0`。
- **明确不做"选中即复制"**：选区保留到下次点击，与 GNOME Terminal 一致。
- **粘贴走 `term.paste()`**（不是手写 `\n` 注入）：确保 bracketed paste 包裹，避免多行粘贴被逐行执行。
- **13 项右键菜单**：分 4 组，含快捷键提示与禁用态，Esc 关闭。
- **`term.onResize` 上报**：PTY 尺寸与本地窗口网格同步（此前光标位置/显示会错位）。

### 二、命令面板（CommandPanel.tsx）层级重建

问题清单（用户逐条否决）：蓝色胶囊标题"喧宾夺主"、导入导出"太大了"、命令与文件夹卡片形态雷同、"命令"两字重复出现两次、置顶命令"双重强调"、展开/折叠箭头多余、搜索框曾被删（无场景）但总数无处安放。

最终形态：

- 面板头是**纯文本"命令集"**（无胶囊、无图标）；总数下沉为搜索框 placeholder：`` `搜索 ${entries.length} 条命令…` ``。
- **父子靠形态质变 + 缩进**，不靠色差：
  - **文件夹 = 容器**：`rounded-lg border bg-[var(--bg-surface)]`，**唯一有背景板的元素**，展开体 `<div className="pb-1.5">` **包在板内**（不是散落在外）。
  - **命令 = 叶子**：静止**无背景**，`hover:bg-[var(--surface-hover)]` 才浮底；仅靠 `paddingLeft` 缩进（26px）区分层级。
  - 子文件夹：`style={{ marginLeft: pad }}` + `bg-[var(--surface-row)]` 表达深度。
- 新增主题 token `--surface-row`（极淡列表行板，`themeUtils.ts`）。
- 置顶命令**只用蓝色星标**，不再叠色（去双重强调）。
- **导入/导出降权**：不再占 header，改为面板空白处右键菜单的「**导出全部命令 / 导入全部命令**」（针对整个命令库的数据操作），与单条命令/文件夹命令分属不同层级。
- `Sidebar.tsx` 删掉整条 h-8 的「命令」标题行（省 32px）。
- `TitleBar.tsx` 侧栏开关从 Logo 上摘出，改为独立 `PanelLeftClose` / `PanelLeftOpen` 按钮。

### 三、导入导出的审计与修复（发现 3 个真实缺陷）

- **导出无任何错误处理** → `handleExportAll` 加 try/catch，成功/失败都走 `flashDataMsg(text, ok)`，不再静默失败。
- **导入不去重** → `commandStore.ts` 按 `label\u0000command\u0000category` 建 `Set`，重复项计 `skipped`，库不再静默翻倍。
- **`command` 字段无类型校验** → 非字符串/空串项跳过并计数。

### 四、内核（meatshell）修复 —— 对应 SSH/串口/Telnet 三个会话后端

> 均已核验在远端 `git show c1ad400:` 中存在。

- **ZMODEM 误判**（`ssh.rs`）：判定从前置宽松匹配收紧为 **4 字节窗口 + hex + 帧类型 0（ZRQINIT）**。此前进度条/二进制输出会被误触发，**劫持主循环**（会话卡死）。新增 `zmodem_hex_nibble`（126 行改动主体）。
- **跨包 UTF-8 乱码**（`ssh.rs` / `serial.rs` / `telnet.rs`）：新增 `decode_utf8_chunk`，把**不完整尾字节留到下一包**处理。此前跨包 CJK/emoji 会被切成 `U+FFFD`（``）。
- **回显抑制窗口无兜底**（`ssh.rs`）：`ECHO_TIMEOUT = 2s`，超时强制放行，避免抑制窗口吞掉后续正常输出。
- **`url_decode` 多字节**（`ssh.rs`）：改用 `from_utf8_lossy`，修复 `%E4%B8%AD` 这类转义被逐字节拼坏。

### 五、文档修补（本文件）

- 第 1~26、59~104 行**原始中文已在早期编码事故中丢失**（只剩 `?`，git 全历史一致，**无法还原**）：替换为"可核实事实"块 + 保留原始教训。
- 修掉重复标题（`## 2026-06-23 — Encoding Warning (编码警告)` 曾出现两次）。
- **裁决 BOM 自相矛盾**：06-23 节说"必须 without BOM"、07-12 节说"统一加 BOM"。结论：**硬约束只有一条 —— JSON 绝不能带 BOM**；TS/TSX/Rust/CSS 带不带都能构建；**不再批量加、也不批量清**。
- 上述 06-23 / 07-12 两节点均已就地加 ⚠️ 引用块，避免后人照做。
- 把过时的硬编码"含中文源文件列表"（含已删除的 `SessionManager.tsx`）换成 grep 命令。
- 修正 `Ctrl+T` → `Ctrl+Shift+T`；标注 Vzfl2.2"搜索框已删除"已被回退；更新已失效的 `mcp__node_repl__js` 引用。

### 六、改动文件

| 文件 | 变化 |
| --- | --- |
| `meatshell/src/ssh.rs` | 126 行（ZMODEM / UTF-8 / ECHO_TIMEOUT / url_decode） |
| `meatshell/src/serial.rs` `telnet.rs` | 各 4 行（接 `decode_utf8_chunk`） |
| `src/components/CommandPanel.tsx` | 层级重建 + 导入导出降权 + 审计修复 |
| `src/stores/commandStore.ts` | 导入去重 + 字段校验 |
| `src/components/layout/TitleBar.tsx` `layout/Sidebar.tsx` | 侧栏开关独立化 / 删标题行 |
| `src/lib/themeUtils.ts` | 新增 `--surface-row` |
| `package.json` `src-tauri/tauri.conf.json` `package-lock.json` | 版本 2.8.0 → 2.9.0 |
| `DEVLOG.md` | 文档修补（本节） |

### 七、本版本有意未做

- 分组拖拽排序、分组作为一等对象 —— 同 Vzfl2.8，未动。
- 打包分发字体（Noto Sans SC subset）—— 未动。

---

## 2026-09-24 — P2 审查修复：数据目录 / 日志 / 并发 / 持久化 / CI

> 触发：对内核（`meatshell`）、桥接层（`src-tauri`）、前端（`src/`）做了一轮全项目技术审查，产出整改路线图（`.trae/documents/opentermo-remediation-roadmap.md`，未纳入 git），再按「**每项一个 commit、批间设验证闸门**」的方式逐条执行。
> commit 区间：`9caff01` … 本节所在 commit（**每项一个 commit**，含本节的文档收尾），**未打 tag、未发 Release**。
> 每批验证：前端 `npm run build`、桥接层 `cargo check --manifest-path src-tauri/Cargo.toml`、内核 `cargo test --manifest-path meatshell/Cargo.toml`（14 项单测全绿）。

### 一、数据与日志：让落盘真的发生

- **数据目录双轨**（`meatshell/src/config.rs`）：`app_data_dir()` 改用 Tauri 标识符 `dev.opentermo.app`，并新增 `migrate_legacy_data()` —— 首次启动把旧目录的 `sessions.json` / `commands.json` **搬运**（不是复制后二选一），旧文件保留可回退。此前"读写用的目录"与"Tauri 认定的应用目录"不是同一个，换个入口读到的就是另一份数据。
- **tracing 从未初始化**（`src-tauri/src/lib.rs` / `main.rs`）：接入 `init_tracing()`（`try_init` + 写文件层），此前所有 `tracing::warn!` 都是空转 —— 出问题时没有任何日志可查。文件层写入失败时回退到 stderr。
- **删依赖与无效配置**：清掉确认无引用的 crate 依赖，以及 Cargo.toml 里失效的 `panic = "abort"`（Tauri 侧根本不会生效，留着只会误导）。

### 二、前端低风险修复（5 项）

- 命令面板与会话启动台的**入场动画失效**：动画类名与实际挂载时机对不上，改为正确触发。
- 终端右键菜单的 `contextmenu` 监听器**从不解绑**，随标签页开关累积。
- 终端热路径（`onData` / `onResize`）的 IPC 失败改为吞掉并注释说明 —— 这些调用在标签页销毁时必然竞态失败，此前会变成 unhandled rejection。
- `SessionConfig` 补上后端一直在发的 `forwards` 字段（类型定义与真实载荷对齐）。
- `tauriCommands.ts` 分节注释的**双重编码损坏**（`?` 与乱码）修复。

### 三、事件通道显式化 + 清理 SFTP 死变体（内核）

- 桥接层的事件转发从 `_ => {}`（静默丢弃）改为**逐变体表态**，今后内核新增事件会在编译期暴露，而不是运行期被吞。
- 删掉 5 个**零生产者**的 `Sftp*` 事件变体（内核里没有 SFTP 实现，这不是"接线遗漏"而是能力不存在），`SftpTransfer` 相应改名。
- 删掉 `CommandRan`（OSC 697）及其生产者 —— 同样无人消费。

### 四、桥接层并发与阻塞（本轮风险最高的两项，**故意分开提交**）

- **D1 `rclone_mount` 整段持 `MOUNT_OP`**（`5493885`）：挂载期间（WMI 查号 + 起进程）一直握着全局锁，此时关标签页要等数秒。改为「**在飞预订**」：短临界区占号 → 锁外慢活 → 提交时校验预订仍属于自己（以唯一 `config_name` 作身份）→ 被取消则杀进程。`unmount_all` 需先**释放锁再排空预订**，否则会等一个"只有拿到锁才能释放预订"的尝试而自锁。
- **D2 `#[tauri::command(async)]` 包着同步函数**（`751a069`）：等于占住 tokio worker。改为 `async fn` + `tokio::task::spawn_blocking`。

### 五、性能与持久化（4 项）

- **`write_text_file` 越权原语**（`9b672a4`）：原先接受任意路径 + 任意内容，等于给 webview 一个"向任意位置写任意文件"的能力。加扩展名白名单（仅 `.json`），导出流程不受影响。
- **侧栏状态不持久化**（`6ce74aa`）：展开态与宽度写入 `localStorage`，启动时读取并 clamp。收起时宽度仍记 0（`Sidebar` 直接用其作样式宽度），另存 `savedSidebarWidth` 供下次展开还原。
- **`save_command` 的 O(n²) 文件读写**（`b5f6f46`）：每次调用要完整 `load` 两次（一次读入、一次读回来做回显）+ 写一次；导入 N 条、重命名文件夹下 N 条都循环调用它。新增批量命令 `save_commands`（一次 load、一次 save）与 `upsert_entry`，前端 `renameFolder` / `importCommands` 改为收集后一次提交。
- **PTY 初始尺寸硬编码 80×24**（`646c619`）：连接时由前端带上当前网格（记住最近一次 resize 的结果），消除"首屏提示符折行、光标列数错位直到首次 resize 才恢复"。该网格**只保留在本次运行内**，重启后第一个标签仍回落 80×24。

### 六、清理收尾（本节提交）

- **死代码**：`sessionStore.reorder`、`CommandStore::{reorder, categories, new_entry}`、`SessionHandle` 的 `join` / `events` / `ssh_handle`（`src-tauri` 侧零引用）、`App.tsx` 的 `String.fromCharCode(0x2328)`（改为直接字符 `⌨`）。
  - 删 `ssh_handle` 后 `ssh_cell` 不再对外暴露，但仍在内部传给 `run_session`（SSH 会话句柄）；`JoinHandle` 改为**立即丢弃**——tokio 中丢弃 `JoinHandle` 不会取消任务，且无人等待会话结束。
- **一致性**：`get_system_stats` 的 `std::sync::Mutex::unwrap()` 统一为项目通用的 `parking_lot`（不再有 panic 路径）。
- **CI**（`.github/workflows/ci.yml`）：`npm install` → **`npm ci`**（可重现构建）；`if-no-files-found: warn` → **`error`**（防发版静默缺产物）。

### 七、本轮明确未做

- **不做 SFTP 功能** —— 内核没有生产者，是能力不存在，不是接线遗漏。
- **不重构 `CommandPanel.tsx`(1060 行) / `SessionLauncher.tsx`(769 行)** 的体量问题 —— 独立议题。
- **不做数据目录迁移之外的用户数据变更**；**不打 tag、不发 Release**。

