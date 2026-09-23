# OpenTermo 全项目审查提示词（v1）

> 用法：把本文件**全文**作为提示词交给一个具备读写代码能力的 Agent（在仓库根目录 `C:\Users\65451\Desktop\Github\OpenTermo` 或 `OpenTermo-fixed` 下运行）。
> 本文件是"审查任务书"，不是"结论"。里面「已知线索」一节是**待验证的怀疑点**，不是既成事实——请独立验证，允许推翻。

---

## 0. 角色与总目标

你是一名同时具备 **Rust 系统编程**、**Tauri 2 桌面应用**、**React/TypeScript 前端**、**SSH/终端协议**四个方向经验的资深工程师，被请来做一次**只读的、证据驱动的全项目审查**。

目标：找出这个项目**真实存在**的问题，并给出**可直接落地**的修复方案。不写新功能，不重构代码，不修改任何文件。

审查对象是 fork 自 `yituorou/meatshell` 的终端客户端 **OpenTermo**（Tauri 2 + React 18 + xterm.js），它保留了大量上游内核能力，只接了一部分到自己的 UI 上——**"上游遗产与本地实现之间的错位"是本项目最大的风险来源，也是本次审查的主线**。

---

## 1. 项目事实基线（审查开始前请用代码核实，不要照抄）

| 项 | 值 |
| --- | --- |
| 应用目录 | `OpenTermo-fixed/`（git 仓库根在其上一层 `OpenTermo/`，分支 `zfl`） |
| 前端 | React 18 + TypeScript 5.6 + Vite 6 + Tailwind 3 + zustand 4 |
| 终端 | xterm 5.3.0 + `xterm-addon-fit` + `xterm-addon-search`（DOM renderer） |
| 后端 | Tauri 2（`src-tauri/`，含 `commands.rs` / `session.rs` / `prompts.rs` / `lib.rs`） |
| 内核 | vendor 的 crate `meatshell` 0.4.12（`OpenTermo-fixed/meatshell/`），**同时是 lib 和 bin** |
| 会话类型 | SSH（russh 0.49）/ 串口（serialport 4）/ Telnet |
| 版本 | `package.json` 与 `src-tauri/tauri.conf.json` 均为 2.9.0 |
| 发布 | push `zfl` 或 tag `Vzfl*` → `.github/workflows/ci.yml` → `npx tauri build` → 打 tag 时用 `softprops/action-gh-release@v2` 发 Release |
| 文档 | `DEVLOG.md`（迭代日志）、`CHANGELOG.md`、`AGENTS.md`、`README.md` |

**核实基线**（请自己跑一遍并在报告开头写明实际结果，作为后续所有结论的基准）：
```bash
npx tsc -b --force          # 在 OpenTermo-fixed/
npm run build               # 在 OpenTermo-fixed/
cargo check                 # 在 OpenTermo-fixed/src-tauri/
```

---

## 2. 必须建立的"权威数据流图"（审查的骨架）

不要凭印象描述架构。请按下面四条**互相独立**的通道，逐条读代码后画出**真实的**（不是设计的）数据流，标出每一跳的文件与行号：

**通道 A — 用户输入 → 远程（字节流，上行）**
`xterm.onData` → `sessionStore.sendInput` → invoke `send_input` → `SessionManager.send_input` → `SessionHandle.commands`（`UnboundedSender<SessionCommand>`）→ `run_session` 主循环 `RawInput` → `channel.data()`

**通道 B — 远程 → 屏幕（字节流，下行）**
`channel.wait()` → `contains_zmodem_init` 分流 / `decode_utf8_chunk` → `SessionEvent::Output(String)` → `meatshell::SessionHandle.events` 的 `UnboundedReceiver` → `src-tauri` 的 `forward_events` → `app.emit("terminal-output:{tab_id}")` → 前端 `listen()` 回调 → **`window.dispatchEvent(new CustomEvent("terminal-data:{tab}"))`** → `TerminalView` 的 window 监听 → `term.write()`

**通道 C — 控制/事件流**
尺寸：`term.onResize` → `resize_terminal` → `SessionCommand::Resize` → `channel.window_change`
状态：`SessionEvent::{Status,Connected,Closed}` → `terminal-status/connected/closed:{tab}`
弹窗：`SessionEvent::{HostKeyPrompt,CredentialPrompt}` → `PromptManager` 注册 responder → `host-key-prompt` / `credential-prompt` → `reply_host_key` / `reply_credential` → `responder.respond()`
统计：monitor 通道 `/proc/*` → `SessionEvent::ResourceStats` → `remote-stats:{tab}`
目录：OSC 7 → `SessionEvent::CwdChanged` → `terminal-cwd:{tab}`

**通道 D — 持久化**
会话：`meatshell::ConfigStore`（`sessions.json`，密码 ChaCha20-Poly1305 加密落盘）
命令：`meatshell::CommandStore`（`commands.json`，明文）
前端本地：`localStorage`（主题/字号/分组名册/空文件夹/搜索历史…）
背景图：`app_data_dir()/background.jpg`

对每条通道都要回答：**在哪些点上信息会丢失、被覆盖、被静默丢弃、或出现生命周期竞态？**（提示：通道 B 的最后两跳、通道 D 的"前端对象 → 后端结构体"往返，是重点怀疑区。）

---

## 3. 审查范围与优先级

按 **P0 → P3** 分配精力，不要平均用力：

- **P0 数据正确性 / 数据丢失 / 崩溃**
- **P1 竞态与生命周期**（连接、断开、标签页关闭、应用退出、锁的顺序）
- **P2 资源与性能**（重复 I/O、轮询、阻塞 async worker、无界缓冲）
- **P3 遗留代码、类型漂移、文档失真、可维护性**

---

## 4. 分层审查清单（逐项给结论，允许写"已核实无问题"）

### 4.1 内核 crate `meatshell`（`OpenTermo-fixed/meatshell/src/`）

重点文件：`ssh.rs`（1540 行）、`config.rs`、`zmodem.rs`、`telnet.rs`、`serial.rs`、`command.rs`、`proxy.rs`、`forward.rs`、`known_hosts.rs`、`errlog.rs`、`i18n.rs`、`main.rs`

要回答：
1. `ssh.rs` 主循环 `tokio::select!` 各分支是否可能**饿死**或**忙等**？`mon = async { … }` 那个把 `Option<Channel>` 折成 `pending()` 的写法，在 `mon_channel = None` 之后是否真的永久静默？
2. `contains_zmodem_init` 只做**单包内** 4 字节窗口匹配。若 `\x18B00` 跨两个 SSH 包到达，会发生什么？`decode_utf8_chunk` 已经处理了跨包 UTF-8，ZMODEM 判定为什么没有同等处理？后果是什么（漏判是安全的还是危险的）？
3. `decode_utf8_chunk` 的 `pending` 缓冲**有没有上界**？恶意/异常服务端持续发不完整序列会怎样？
4. `suppress_echo` / `echo_buf` / `ECHO_TIMEOUT` 三者的状态机是否在所有路径上都能收敛？`PROMPT_PREFIX` 被用户输出意外命中的可能性有多大？16 KiB 上限触发时会**吞掉**什么？
5. `plan panic = "abort"` 写在 `meatshell/Cargo.toml` 的 `[profile.release]` 里——**它在以 `src-tauri` 为 workspace 根的真实构建中是否生效**？如果生效，任何 `panic!` 会怎样影响用户体验？
6. `SessionEvent` 共 17 个变体，`src-tauri` 只消费 8 个（见 4.2）。请列出**全部未被消费的变体**，并判断每一个是"刻意未实现"还是"漏接"。特别注意 SFTP 系列与 `CommandRan`。
7. `SessionHandle` 的 `join` / `events` / `ssh_handle` 三个字段在 `src-tauri` 侧是否被使用？未使用意味着什么（能力缺失 / 资源未回收）？
8. `CommandStore` 的 `reorder` / `categories` / `new_entry` 是否被任何调用方使用？
9. `ConfigStore` 的媒体路径：`ProjectDirs::from("dev","meatshell","meatshell")` 与 Tauri 的 `identifier: "dev.opentermo.app"` 是否指向不同目录？这会造成什么问题（品牌、与上游 meatshell 共存时的数据串味、迁移）？
10. `ConfigStore::save` 的加密是否覆盖**所有**写入路径？`list_sessions` 把**明文密码**回传前端是否是刻意的？前端持有明文密码意味着什么？
11. `main.rs` 里的 `init_tracing` 只在**独立 bin** 里被调用。Tauri 应用里有没有初始化 `tracing`？如果没有，`errlog.rs`（capped `error.log`）与 `ssh.rs` 里那些 `tracing::warn!("ssh connection closed …")`（#86 诊断）实际会怎样？这对"用户报 Bug 时拿不到日志"意味着什么？
12. `serial.rs` / `telnet.rs` 与 `ssh.rs` 是否存在**重复实现**（键盘处理、OSC 解析、事件构造）？差异是否会导致三种会话类型行为不一致？

### 4.2 桥接层 `src-tauri/`

重点文件：`session.rs`、`commands.rs`、`lib.rs`、`prompts.rs`

要回答：
1. `forward_events` 末尾的 `_ => {}` 一共吞掉了哪些 `SessionEvent`？（逐个列出）
2. `SessionManager::connect` 里 `ssh::spawn_session(..., 80, 24)` / `spawn_telnet_session(..., 80, 24)` 是**硬编码尺寸**。前端明明知道网格大小，为什么没传进来？内核 API 的文档注释说"传入已知尺寸可以避免远端从陈旧的 80×24 起步"，这个能力是否被浪费了？后果（首屏错位/SIGWINCH）是什么？
3. `send_input` / `resize` 在 `session not found` 时返回 `Err`。前端在热路径上**不 await、不 catch** 地调用它们。会产生什么（unhandled rejection）？在哪几个调用点？
4. `MOUNT_OP`（`parking_lot::Mutex`）的加锁顺序：`disconnect` / `rclone_mount` / `rclone_unmount` / `prune_dead_mounts` / `unmount_all` 是否可能**交叉持有** `mounts` / `session_configs` / `sessions` 而彼此阻塞或死锁？请列出每处的加锁顺序并逐一比对。
5. `rclone_mount` 是 `#[tauri::command(async)]`，但里面 `std::thread::sleep(2s)` + `powershell` WMI 查询是**阻塞**的，且全程持有 `MOUNT_OP`。这会占用 tokio worker 多久？在什么并发下会造成卡顿？
6. `save_command` 一次调用做 **load → upsert → save → 再 load** 两次全文件 I/O。前端 `importCommands` 与 `renameFolder` 是**逐条循环调用**它。N 条命令 = 多少次文件读写？文件不存在时 `CommandStore::load` 会怎样处理并发写？
7. `lib.rs` 的窗口关闭流程：`is_closing` 原子标志 + `api.prevent_close()` + 后台线程 `unmount_all` + 逐个 `disconnect` + `run_on_main_thread(destroy)`。有没有**关不掉**或**关一半**的路径？`unmount_all` 里的 `sleep(300ms)` 与 `disconnect` 里的 `sleep(500ms)` 串行叠加，最坏情况退出耗时多少？
8. `lib.rs` 里 `RCLONE_PATH: OnceLock` 的懒发现：`discover_rclone()` 会依次尝试 `where`、递归扫 winget 目录、常见路径。首次调用发生在哪（`setup` 里？）会不会**阻塞启动**？找不到时退回 `"rclone.exe"`，之后的失败表现是什么？
9. `SessionManager::new()` 用 `.expect("failed to create tokio runtime")`；`lib.rs` 末尾 `.expect("error while running tauri application")`。这些 panic 的可见后果？
10. `get_system_stats` 用 `std::sync::Mutex` + `.unwrap()`（与项目其它地方用的 `parking_lot` 不一致）。中毒（poisoned）时会怎样？

### 4.3 前端 `src/`

重点：`stores/{sessionStore,settingsStore,commandStore,uiStore}.ts`、`lib/{tauriCommands,themeUtils,sessionGroups,sessionInfo}.ts`、`components/**`、`App.tsx`

要回答：
1. **通道 B 的最后两跳**：`sessionStore` 收到 Tauri 事件后**再** `window.dispatchEvent(CustomEvent)` 给 `TerminalView`。为什么要多这一跳？在"后端已 emit 输出"和"`TerminalView` 的 window 监听挂上"之间存在什么窗口？**首屏 banner / 欢迎语会不会丢**？请给出精确的时序论证（`connect()` 里 `await _setupListener()` 与 React 渲染的相对顺序）。
2. `_setupListener` / `_teardownListener` 都是 `async`，而 `_unlisteners` 是在 `await` **之后**才 `set()` 的。若在 `listen()` 未完成时调用 `disconnect()`，会发生什么（监听器泄漏？给已关闭标签页继续派发事件？）。`_unlisteners` 是一个普通 `Map` 存在 zustand state 里，这样用安全吗？
3. `sessionStore.reorder` 是否被任何地方调用？如果没人调用，它是纯死代码吗？
4. `TerminalView` 的 `contextmenu` 监听是匿名函数且**在 cleanup 里没有 remove**（`mousedown` 那个 `onMiddleDown` 有）。这个 effect 的依赖数组是 `[tabId, sendInput, onResize, openSearch, closeSearch]`——这些依赖真的稳定吗？不稳定的后果是"右键菜单叠加"吗？
5. `TerminalView` 里 `term.onResize` → `onResize(tabId, cols, rows)`（= `resizeTerminal` 的 promise）**没有 catch**；`term.onData` → `sendInput` 同理。列举所有未捕获的 IPC 失败路径。
6. `uiStore` 的 `sidebarWidth` / `isSidebarOpen` **没有持久化**，而主题/字号都持久化了。这是刻意的还是遗漏？（注意上游 `ConfigFile` 里有 `collapse_sidebar_default` 字段，且当前无人使用。）
7. `tauriCommands.ts` 里的 `SessionConfig` 接口**没有 `forwards` 字段**，而 Rust 的 `Session` 有（`#[serde(default)]`）。请判断：UI 保存会话时会不会静默清空已有隧道？逐个检查所有构造/回写 session 对象的代码路径（`ConnectDialog`、`EditSessionDialog`、`SessionLauncher` 的"重命名/移动分组"），确认哪些是 `{...s}` 展开、哪些是逐字段重建。
8. `tauriCommands.ts` 的**注释里有明显的 GBK/UTF-8 双重编码损坏**（形如 `鈹€鈹€`）。请全仓库排查此类损坏，列出所有文件与行，并判断它是否只是注释（无害）还是波及了字符串字面量/正则/类名（有害）。
9. `CommandPanel.tsx` 里有 `animate-scale-in` 类。请在**源码、`index.css`、`tailwind.config.ts`、`dist/assets/*.css`** 四处分别确认它是否有定义，并给出结论（是否为惰性/死类）。同一个类还在哪些文件出现？
10. 主题 token：把 `src/**` 里所有 `var(--x)` 与 `themeUtils.ts` 的 `setProperty` + `index.css` 的 `:root` 做集合比对，列出**用了但没定义**和**定义了但没人用**的 token。注意 `themeUtils` 里 `for (const [name, c] of …) r.setProperty(\`--${name}-rgb\`, …)` 这种动态写入要按前缀展开。
11. `App.tsx` 里 `{String.fromCharCode(0x2328)}` 这种写法（而不是直接写 `⌨`）是历史遗留的编码规避。还有多少同类"不敢直接写字符"的规避？它们是否说明仓库里仍有未解决的编码工作流问题？
12. `CommandPanel.tsx`（1060 行）与 `SessionLauncher.tsx`（769 行）是否承担了过多职责？各自内部的排序 / 分组 / 右键菜单逻辑有没有和 `lib/sessionGroups.ts`、`ui/context-menu.tsx` **重复**？
13. 全局快捷键矩阵：`App.tsx`（Ctrl+Shift+W / Ctrl+PageUp·PageDown）、`TerminalView`（Ctrl+Shift+C/V/A/F/K/T/W、Ctrl+Ins/Shift+Ins、中键）、`SettingsPanel`、`CommandPalette`、`SessionLauncher`、`ui/context-menu.tsx` 各挂了 window/keydown 监听。请列出**完整键位表**并找出**冲突、重复绑定的处理者、以及被 preventDefault 后漏给原生 readline 的键**。特别核对："Ctrl+C 必须永远是 SIGINT"这条约束是否在**所有**路径上都成立（含右键菜单、粘贴、搜索框聚焦、弹窗打开时）。
14. `settingsStore.setTheme` 在切主题时改写全局透明度键，并在进出 `custom` 时快照/回灌。请构造"深蓝 → 自定义 → 白天 → 自定义 → 重启"的时序，验证透明度是否最终落在预期值；找出可能的错配（例如"点当前已选主题"的分支、`custom-accent` 与 `custom-base` 的独立性）。

### 4.4 构建 / 发布 / 文档

1. `meatshell/Cargo.toml` 声明了 `arboard`、`vt100`、`russh-sftp`、`sysinfo`、`tracing-subscriber`、`rand`、`base64`、`sha1/sha2/aes/argon2/cbc/hmac` 等依赖。逐个判断：在当前 Tauri 应用里**是否真的有代码路径用到**？未使用的依赖对编译时间与产物体积的影响有多大？`[[bin]] meatshell` 这个 smoke-test bin 是否会被 CI 一起编译？
2. `src-tauri/capabilities/default.json` 授予的权限是否**大于**实际使用？（例如 `fs` 插件权限 vs 前端只用了一个 `write_text_file` 自定义命令。）
3. `tauri.conf.json` 的 `"csp": null`、`"devtools": true`、`"transparent": true`、`"withGlobalTauri": false` 分别意味着什么风险？在**发布版**里 `devtools: true` 是否应该保留？
4. `ci.yml` 用 `npm install`（不是 `npm ci`）、缓存 key 基于 `package-lock.json`、`tauri build` 走 pwsh 重试 3 次、`if-no-files-found: warn`。指出其中会导致**发版静默缺产物**或**不可重现构建**的点。
5. 版本号一致性：`package.json` / `tauri.conf.json` / `package-lock.json` / Rust crate / git tag / Release 名。有没有任何一处可以由 CI 自动校验？
6. `DEVLOG.md` 是否与代码现状一致？请抽查它最近的条目（Vzfl2.8、Vzfl2.9）里列出的每个文件名/函数名/键名/快捷键，找出**已不存在的文件、已改名的键、已改键位的快捷键**。（已知它历史上出现过 BOM 结论自相矛盾、乱码段落、引用已删除文件。）另外确认：`AGENTS.md` 与 `CONTRIBUTING.md` 里的规则是否与代码现实一致？

### 4.5 安全（只报"可由本次代码证明可利用"的问题）

1. 明文密码在 webview 内存 / IPC 报文中流转；`sessions.json` 落盘加密但 `key` 与文件在同一目录（`config.rs` 附近的 `key_path`）。评估真实防护强度，以及"同机其它用户/进程"能否读走。
2. `write_text_file` 接受**任意路径 + 任意内容**，是前端唯一写文件入口。前端是否有任何路径能让**远程**内容决定这个路径？（检查导出流程的输入来源）
3. `run_session` 注入的 `PROMPT_BODY` 与 `MON_CMD` 是**在用户的登录 shell 里执行**的字符串。`MON_CMD` 已重置 `PATH`，`PROMPT_BODY` 呢？它的构造中是否有变量插值被远端数据污染的可能？
4. `rclone` 配置里 `pass` 以命令行参数传入（`cmd.arg(pw)`）——在 Windows 上密码是否会出现在进程命令行（任何用户可 `Get-CimInstance Win32_Process` 读到）？
5. `zmodem::receive` 把远端内容**直接写入 Downloads 目录**。文件名是否来自远端且未做路径净化（`../`、绝对路径、Windows 保留名）？
6. SSH 的 `check_server_key` → `known_hosts::verify` → 弹窗确认链路：`changed: true`（疑似 MITM）时 UI 是否给了**足够强的警告**，还是一句普通的"确认"？

---

## 5. 已知线索（**待验证的怀疑点**，不是结论）

下列线索来自一次快速通读，很可能有误。**请逐条独立验证**，并明确写出"成立 / 不成立 / 部分成立"，不成立的要说明为什么。

1. `src/lib/tauriCommands.ts` 第 4/33/48/62/84/157 行附近的中文注释是 GBK 误读产生的乱码（`鈹€`）。
2. `animate-scale-in` 在源码里被使用（`CommandPalette.tsx`、`SessionLauncher.tsx`），但仓库里没有定义（`@keyframes` / `tailwind.config.ts` / `theme-*` 都没有）。产物 CSS 里也没有它。
3. `sessionStore.reorder` 无调用方。
4. `TerminalView` 的 `contextmenu` 监听没有在 effect cleanup 中移除。
5. `SessionManager::connect` 把 PTY 初始尺寸硬编码为 80×24，浪费了内核 `spawn_session(initial_cols, initial_rows)` 的入参。
6. `forward_events` 的 `_ => {}` 丢弃了 `SessionEvent` 中所有 SFTP / `CommandRan` 变体。
7. Tauri 应用没有初始化 `tracing`，所以 `errlog.rs` 的 `error.log` 实际上永远不会被写出。
8. `ConfigStore` / `CommandStore` 把数据写在 `dev/meatshell/meatshell` 下，而 Tauri 的 `app_data_dir()` 是 `dev.opentermo.app`；背景图与会话数据落在两个不同目录。
9. `tauriCommands.ts` 的 `SessionConfig` 缺 `forwards` 字段（类型漂移）。
10. `settingsStore` 里的 `opentermo-custom-base` 只在读写时被 `loadPresetThemeId` 归一化，值非法时会静默变成 `deep-blue`。
11. `Sidebar` 的宽度/开合状态不持久化。
12. `commands.rs::get_system_stats` 用 `std::sync::Mutex::unwrap()`，与项目其它处的 `parking_lot` 不一致。

---

## 6. 证据与判定规则（**必须遵守**）

- **每条结论都必须带证据**：`文件路径:行号` + 关键代码片段（不超过 10 行）。没有证据的结论不要写。
- **区分三档置信度**：
  - `[已证实]` — 代码路径可直接推出，或我已实际运行/复现
  - `[高概率]` — 逻辑上成立，但依赖运行时前提
  - `[待验证]` — 只是怀疑，需运行或构造用例才能确认（要写清"如何验证"）
- **禁止**：堆砌通用最佳实践、复述代码、给出"建议加注释 / 建议加类型"这类无信息量的条目。
- 如果某条线索被推翻，**也要写进报告**（"曾怀疑 X，实际不成立，原因是 Y"）——这能防止下一个人重复怀疑。
- 允许并且鼓励指出**本提示词本身的错误**（包括第 5 节线索的错误、第 2 节数据流图的错误、第 3 节优先级判断的错误）。请单列一节。

---

## 7. 严重度定义

| 级别 | 含义 | 处理建议 |
| --- | --- | --- |
| **S1 严重** | 数据丢失 / 崩溃 / 安全漏洞 / 会话不可用 | 立即修，需给出补丁级方案 |
| **S2 中等** | 竞态、资源泄漏、性能退化、行为不一致 | 排期修，给出改法与回归点 |
| **S3 轻微** | 死代码、类型漂移、文档失真、可读性 | 顺手清理 |

---

## 8. 输出格式（严格按此结构）

```
# OpenTermo 审查报告
## 0. 基线与验证方式
   - tsc / build / cargo check 的实际输出摘要
   - 使用的工具与命令（可复现）
## 1. 执行摘要
   - 3-6 条最重要结论，每条一行，带 `文件:行`
   - 一句话总体健康度判断
## 2. 架构与数据流实况
   - 四条通道的真实链路 + 每一跳的 `文件:行`
   - 与第 2 节给出的"设计图"的差异清单
## 3. 问题清单（按 S1 → S3 排序）
   每条固定字段：
   ### [级别] 标题
   - 置信度：已证实 / 高概率 / 待验证
   - 位置：`path:line`
   - 证据：代码片段（≤10 行）
   - 影响：具体后果（不要写"可能有问题"）
   - 复现/验证方法：可执行步骤或断言
   - 修复方向：最小改动方案 + 需回归的点
## 4. 内核与前端的能力错位清单
   - 内核有、UI 没接：表格（能力 / 证据 / 影响 / 建议）
   - UI 有、内核不支持：同上
   - 两端签名/类型漂移：同上
## 5. 死代码与遗留物
   - 表格（文件 / 符号 / 判定依据 / 可安全删除？）
## 6. 文档失真清单
   - DEVLOG / README / AGENTS 与代码不符之处，逐条给"文档说 X，实际 Y，证据 Z"
## 7. 本次审查推翻的怀疑
## 8. 对审查提示词本身的修正建议
## 9. 建议的下一步（按性价比排序，≤7 条，不含时间估算）
```

---

## 9. 验收标准（自检后再交）

1. 第 3 节每条问题都有 `文件:行` 证据，且**没有一条**是"建议加注释/加类型/加测试"这类空泛项。
2. 第 4 节的三张表格各自非空，且每一项都能在代码里指出具体位置。
3. 第 2 节画出的数据流与提示词给出的设计图**存在可解释的差异**（若完全一致，说明没有真的读代码）。
4. 第 7 节至少推翻或修正了第 5 节中的一条线索。
5. 报告里没有任何"可能""也许""建议考虑"式的模糊结论——要么给结论给证据，要么标 `[待验证]` 并写清验证方法。
6. 全程**未修改任何文件**（只读审查）。若确需运行命令，只允许只读或构建类命令。

---

## 10. 硬性禁止

- 不修改、不新建、不删除任何源码或文档文件（本任务纯审查）。
- 不执行 `git commit` / `git push` / 打 tag / 发 Release。
- 不执行会破坏用户环境的命令（`git reset --hard`、`clean -f`、删除 `target/` 或 `node_modules/` 等）。
- 不把"我读过了"当成结论。每条判断必须有代码坐标。