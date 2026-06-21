# AGENTS.md — Meatshell 项目 AI 开发指南

## 核心原则

### 局部问题不要全局修
遇到样式/UI 问题时，先定位到**具体文件+具体元素**，再动手。
不要一上来就怀疑 CSS 架构、Tauri 后端、WebView 缓存。

### 案例：2026-06-22 字体调试
- 用户说"顶栏字体太细"
- 错误：全局修改 index.css、tailwind.config、App.tsx、Rust 源码，无效 15+ 次
- 正确：只改 TitleBar.tsx 的 `Plus size={}` 和 `text-*` 类名，3 行搞定

### 调试清单
1. 先问：哪个位置？截图/指一下
2. 找到对应组件文件
3. 只改那个组件
4. 不要动全局 CSS 除非确认是系统级问题