

## 2026-06-23 ? ????????

### ??????
????????????????????????????????????
????? JSON ??????????CommandEntry ???? `icon` ?????
???????? UI ??????????

### ??????????
??????????????????????????????????
?? `label` ??????????????????
?? JSON ?????? `label`???????/?????

### ????????????
1. ?? ? ????????autofocus?
2. ?? ? ??????
3. ?? ? ????
4. ?? ? ???????? datalist ?????
5. ????? ? checkbox
6. ?? / ??

### ????
- `src/components/CommandPanel.tsx` ? CommandEditDialog ??

### ????
- ??????????? Python + UTF-8??? PowerShell ??????
- ?? Unicode ?????\uXXXX?????????????

---
---

## 2026-06-23 — Encoding Warning (编码警告)

### 所有含中文的源文件必须是 UTF-8 without BOM

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

**含中文的源文件列表（修改时务必用 Python）：**
- `src/components/CommandPanel.tsx` — 命令面板，右键菜单中文标签
- `src/components/ConnectDialog.tsx` — 连接对话框
- `src/components/EditSessionDialog.tsx` — 编辑会话对话框
- `src/components/SessionManager.tsx` — 会话管理
- `src/components/SettingsPanel.tsx` — 设置面板
- `src/App.tsx`
- `src/index.css` — CSS 变量注释含中文
- `index.html`
- `src-tauri/src/lib.rs` — 注释含中文
- `src-tauri/tauri.conf.json` — JSON 文件不能有 BOM

### CommandPanel.tsx 乱码已修复

原始源文件中部分 Unicode 符号 (✓ 等) 在 git 传输中丢失变成 `??`。已修复为正常中文和 Unicode 字符。
﻿


## 2026-06-23 ? CommandPanel ????????

### ??
????????????????????????? ?????

### ??
??????? Unicode ???? ??? ??? git ??/??????????? `??`????????????

### ????
- `????` ? ???????????????
- ?????? ? ?? `CheckSquare`/`Square` ??????? Unicode ??
- ?????? ? `???` ??????

### ????????
**????** ???????????????????? ? ???????
```
Sort: Name ?  /  ?: ??
Sort: Last Used ?  /  ?: ????
```

**????** ???? + ??????
```
  ????              ? ??????????
  ? ??               ? CheckSquare/Square ?? + ??
    ????            ? CheckSquare/Square ?? + ??
```
?? `lucide-react` ? `CheckSquare`/`Square` ????? `sortMode` ???????

### ????
- `src/components/CommandPanel.tsx` ? ???????????
- `src/components/ui/context-menu.tsx` ? ????????? icon ???

### ????
- ?????/Unicode ?????????? Python + UTF-8 ??
- `CheckSquare` ? `Square` ???? lucide-react ???
- ?????? `localStorage.getItem("cmd-sort")` ???


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
- 命令面板搜索框已删除（无使用场景）
- 会话面板搜索框已删除（无使用场景）
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
// ✅ 使用 Node.js REPL (mcp__node_repl__js) 直接操作文件
var fs = await import('fs');
var text = fs.readFileSync(fp, 'utf8');
// 直接修改字符串，不用考虑 PowerShell 转义
fs.writeFileSync(fp, text, 'utf8');

// ✅ 或写入独立 .py 文件后用 python 执行（不用管道传递）
// 文件内容显式 encoding='utf-8'，不含 \n
```

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
- 新增 `src/components/SessionLauncher.tsx`（767 行），**删除 `SessionManager.tsx`（422 行）**；入口为标题栏 `+` 与 `Ctrl+T`（`uiStore` 加 `isLauncherOpen/openLauncher/closeLauncher`，`App.tsx` 挂快捷键并渲染 `<SessionLauncher />`）。
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
- 侧栏命令面板展开区"层级糊"—— 等命令面板重构一起处理。
- `animate-scale-in` 死类是否清掉 —— 待拍板。
- xterm OSC-8 链接的原生确认框 —— 终端库内部行为。
- 打包分发字体（把 Noto Sans SC subset 进 `public/fonts/`）—— 现在只是"引用本机已装字体"，别人机器上没有就回退雅黑；真要保证跨机一致得下载 woff2 子集进仓库（OFL 允许随包分发），约 0.9–1.5 MB/字重。

