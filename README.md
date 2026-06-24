OpenTermo

一款轻量级、多协议终端客户端。基于 Tauri 2 + React + Rust 构建。

OpenTermo 是一款桌面端 SSH / SFTP / Telnet / 串口客户端，采用现代毛玻璃风格 UI。
它基于 meatshell，这是一个由 一坨肉 (jeff141) 创建的开源 Rust SSH 后端。

与 meatshell 的关系
组件               作者                描述
meatshell/ crate   一坨肉 (jeff141)   核心 Rust SSH/终端后端 (MIT)

Tauri shell / UI   zfloong             桌面应用封装、React 前端、主题

本项目借用 meatshell/ Rust 库作为其终端后端，并在此基础上构建了一个功能完整的 Tauri v2 桌面应用程序。

功能特性

SSH — 密码、私钥、加密密钥（密码短语）
SFTP — 浏览、上传、下载
Telnet / 串口 — 完整支持
端口转发 — 本地 (-L)、远程 (-R)、动态 (-D, SOCKS5)
ZMODEM — 从 sz 接收文件
出站代理 — SOCKS5 / HTTP CONNECT
系统监控 — CPU、内存、交换分区、网络、磁盘（本地 + 远程）
快捷命令 — 分组、可搜索、发送至多个会话
主机密钥验证 — TOFU 机制及变更检测
加密凭证 — ChaCha20-Poly1305
SSH 配置导入 — ~/.ssh/config
国际化 — 英文 / 中文运行时切换

技术栈
层级       技术
前端       React 18 + TypeScript + Tailwind CSS + Zustand

终端       xterm.js 5.x

Shell      Tauri 2

后端       Rust (russh, tokio)

开发

npm install
npm run tauri dev

构建

CI 构建在每次推送时运行。请前往 Actions → 最新运行 → Artifacts 下载。

许可证

MIT — 详见 LICENSE。
meatshell/ Rust crate 同样采用 MIT 许可证，原作者为 jeff141/meatshell。
