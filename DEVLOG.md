
## 2026-06-22: SFTP 文件挂载方案重写 — SSHFS-Win → Rclone

### 背景
之前的文件挂载使用 SSHFS-Win 3.5.20357，但整个文件管理系统处于不可用状态。

---

### 第一阶段：排查 SSHFS-Win 失败原因

#### 错误 1：SSHFS 挂载报 `read: Connection reset by peer`

**现象**：所有服务器（本地 192.168.31.164:22 和远程 156.239.10.171:26985）均挂载失败。

**错误排查路径**（走了很多弯路）：
1. ❌ 怀疑 Cygwin SSH 版本太老（8.4 vs 服务器 9.6）→ 安装 Cygwin 完整环境 → 无效
2. ❌ 尝试用 `-o ssh_command` 指向 Windows 原生 SSH 9.5 → 仍报 `read: Connection reset by peer`
3. ❌ 尝试替换 SSHFS-Win 自带的 ssh.exe → 无权限修改 `C:\Program Files`
4. ❌ 怀疑服务器 SFTP 子系统配置（internal-sftp vs sftp-server）→ 切换后无效

**根因**：SSHFS-Win 的 **内部 SFTP 协议库**（libfuse/libssh2，C 实现）与新版 OpenSSH 服务器（9.2+）的 SFTP 实现不兼容。问题不在 SSH 传输层（ssh.exe），而在 SSHFS 自己的 SFTP 协议处理。即使替换 ssh.exe 也无法解决。

**教训**：区分"传输层"和"协议层"——SSH 连接成功不代表 SFTP 协议能通。

---

### 第二阶段：Rclone 方案验证

#### 验证结果

| 测试项 | SSHFS-Win | Rclone |
|---|---|---|
| HK VPS (OpenSSH 9.6) | ❌ | ✅ |
| 本地服务器 (OpenSSH 9.2) | ❌ | ✅ |
| 两台同时挂载 (M: + N:) | ❌ | ✅ |
| 卸载（杀进程） | ❌ 残留 | ✅ |

Rclone 使用 Go 原生 SFTP 实现，兼容所有 SSH 版本。架构同为 "WinFsp (FUSE) + SFTP over SSH"，性能持平。

---

### 第三阶段：代码集成

#### 改动文件清单

| 文件 | 变更 |
|---|---|
| `src-tauri/src/session.rs` | 新增 `MountInfo { drive_letter, pid, config_name }`；`mounts` 类型从 `HashMap<String, String>` → `HashMap<String, MountInfo>`；新增 `unmount_all()` |
| `src-tauri/src/commands.rs` | `sshfs_mount/unmount/list` → `rclone_mount/unmount/list`；新增 `find_free_drive()`（WMI 盘符检测）、`create_rclone_config()`；PID 精准杀进程 |
| `src-tauri/src/lib.rs` | 新增 `discover_rclone()` 递归探测 rclone.exe 路径；启动时 `taskkill` 清理残留 rclone 进程；关闭时调 `unmount_all()` |
| `src-tauri/Cargo.toml` | 新增 `dirs = "5"` 依赖；移除未使用的 `glob` |
| `src/lib/tauriCommands.ts` | 函数名 `sshfs*` → `rclone_*`，invoke 命令名同步 |
| `src/components/layout/TitleBar.tsx` | 导入和调用名同步 |

---

### 第四阶段：集成中遇到的错误

#### 错误 2：`program not found`

**现象**：挂载时报 `Failed to run rclone config: program not found`

**根因**：`discover_rclone()` 使用 glob 模式 `Rclone.Rclone_*\rclone*.exe` 无法匹配 winget 安装的嵌套子目录结构（实际路径：`Rclone.Rclone_*\rclone-v1.74.3-windows-amd64\rclone.exe`）。

**修复**：放弃 glob，改用 `std::fs::read_dir` 递归遍历 winget 目录，`find_exe_recursive()` 按文件名精确匹配。

---

#### 错误 3：挂载成功但盘符不显示

**现象**：前端显示"挂载成功"，但 Windows 资源管理器看不到盘符。

**根因**：`find_free_drive()` 使用 `cmd /c "if exist M: echo BUSY"` 检测盘符占用，但这个命令对已分配但无介质的物理盘符（DriveType=3）返回 false，导致 rclone 尝试挂载到已被物理占用的 M:。

**修复**：改用 WMI（`Get-CimInstance Win32_LogicalDisk`）获取真实盘符表，准确跳过所有已占用盘符（包括物理盘、网络盘）。

---

#### 错误 4：密码认证服务器挂载失败

**现象**：本地 192.168.31.164（密码认证）挂载失败：
```
couldn't connect to ssh-agent: SSH agent requested, but could not detect Pageant or Windows native SSH agent
```

**根因**：`create_rclone_config()` 把密码错传给了 `RCLONE_CONFIG_PASS`（rclone 自身配置文件的加密密码），而没有传给 SFTP 后端的 `pass` 字段。Rclone 拿不到 SSH 密码就回退到 SSH agent。

**修复**：`cmd.env("RCLONE_CONFIG_PASS", pw)` → `cmd.arg("pass").arg(pw)`

---

#### 错误 5：app 重启后残留 rclone 进程

**现象**：杀死 meatshell-app 后 rclone.exe 子进程（PID 18860）不跟随退出，导致旧的 M: 盘符一直存在。

**根因**：Windows 下子进程默认不会随父进程退出。

**修复**：
1. `lib.rs` 启动时执行 `taskkill /F /IM rclone.exe` 清理残留
2. `session.rs` 的 `unmount_all()` 在窗口关闭时按 PID 精准杀进程

---

### 第五阶段：终端标签切换输出丢失

#### 错误 6：切换标签后终端输出被清空

**现象**：在标签 A 执行命令后切换到标签 B，再切回标签 A，输出全丢失。

**根因**：`App.tsx` 第 38 行：
```tsx
<TerminalView key={activeTabId} tabId={activeTabId} />
```
`key={activeTabId}` 导致 React 在切换标签时 **销毁旧 TerminalView 组件**（xterm.dispose()），再创建新实例。xterm 终端缓冲区随组件销毁而丢失。

**修复**：改为渲染所有标签的终端，用 CSS `display: none/flex` 控制显隐：
```tsx
{tabs.map((tab) => (
  <div key={tab.id} className="absolute inset-0"
       style={{ display: tab.id === activeTabId ? "flex" : "none" }}>
    <TerminalView tabId={tab.id} />
  </div>
))}
```
xterm 实例始终存活，缓冲区不丢失。

---

### 系统清理

| 移除项 | 原因 |
|---|---|
| SSHFS-Win 3.5.20357 | 已被 rclone 替代 |
| Cygwin (`C:\tools\cygwin`) | 误安装，从未使用 |
| `glob` crate | 不再需要 |
| 所有 "sshfs" 代码引用 | 已全部替换为 rclone |

保留：Rclone 1.74.3 + WinFsp 2.1.25156。

---

### 教训总结

1. **区分传输层和协议层**：SSH 能连不代表 SFTP 能通，问题可能出在协议库而非传输工具。
2. **优先验证假设再动手**：不要像本次那样先装 Cygwin、改服务器配置、换 ssh.exe 命令…要先用最小测试验证根本原因。
3. **盘符检测不能用 `if exist`**：Windows 的 `if exist` 对无介质物理盘符返回 false。必须用 WMI。
4. **React key 是双刃剑**：`key={activeTabId}` 方便但会销毁状态，终端这类有状态组件不能用动态 key。
5. **子进程生命周期管理**：Windows 下子进程不会自动跟随父进程退出，必须在 close handler 中显式清理。

# Meatshell 开发日志

## 2026-06-22: 字体调试死循环教训

### 问题描述
用户反馈顶栏 "+" 图标太小、"连接" 文字太细。

### 错误路径
1. 误以为是全局字体系统问题，开始修改 `index.css`、Tailwind 配置、CSS 变量
2. 怀疑 Tauri WebView 缓存，反复清缓存重建
3. 怀疑 CSS 优先级问题，尝试 `!important`、内联样式
4. 怀疑 Rust 后端，检查了全部 Rust 源码
5. 累计尝试了 15+ 次无效的全局 CSS 修改

### 正确做法
只改 `src/components/layout/TitleBar.tsx`：
- `Plus size={14}` → `Plus size={17}`
- `text-xs` → `text-sm`  
- `font-medium` → `font-semibold`

三行改完，一步到位。

### 教训
**局部问题局部修。** 先定位到具体组件再动手，不要一上来就怀疑底层架构。
遇到样式问题先问："哪个位置？哪个文件？哪个元素？" 而不是："整个系统是不是有问题？"