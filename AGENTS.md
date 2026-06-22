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

---

## 开发注意事项（2026-06-22 会话记录）

### 每次修改前必须清理进程
```powershell
taskkill /F /IM meatshell-app.exe 2>$null
taskkill /F /IM node.exe 2>$null
```
旧进程残留会导致端口占用、热更新失效、缓存问题。

### 常见坑位

#### 1. useRef 必须显式 import
- 从 React 解构 import 时容易遗漏 `useRef`
- 缺少会导致运行时崩溃（黑屏），而非编译时警告
- 修改后务必跑 `tsc --noEmit` 检查

#### 2. useCallback 函数定义顺序
- `useCallback` 闭包在创建时捕获外部变量
- 被引用的函数必须在引用者**之前**定义
- 错误顺序：`handleCmdClick`(引用 handleSend) → `handleSend` → 💥 运行时 `undefined is not a function`
- 正确顺序：`handleSend` → `handleExecute` → `handleCmdClick`

#### 3. Python 脚本中的转义字符陷阱
- 在 Python 字符串中写 `"\r"` 会被解释为**真实回车符**（CR）
- TypeScript 代码中需要 `"\\r"` 才能输出字面量 `\r`
- 表现：生成的 .tsx 文件出现换行断裂、unterminated string constant 编译错误

#### 4. 编译前检查清单
- [ ] `tsc --noEmit` 通过
- [ ] 确认所有新增的 React Hook 都已 import
- [ ] 确认 useCallback 依赖顺序正确
- [ ] 清除 Vite 缓存：`rmdir /s /q node_modules\.vite`

### 修改后编译运行命令
```powershell
taskkill /F /IM meatshell-app.exe 2>$null; taskkill /F /IM node.exe 2>$null
cd C:\Users\65451\Documents\Codex\meatshell-app
rmdir /s /q node_modules\.vite 2>nul
rmdir /s /q dist 2>nul
npm run tauri dev
```
