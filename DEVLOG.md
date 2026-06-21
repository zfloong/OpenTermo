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