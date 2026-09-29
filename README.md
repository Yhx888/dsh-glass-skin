# dsh-glass-skin

给 DeepSeek Harness 桌面端/Web 界面做**苹果 Liquid Glass（液态玻璃）**皮肤：
只把**圆角矩形表面**——对话框/弹层、卡片、输入框卡片、左侧栏——做成半透玻璃，
**页面背景一律不动**（不覆盖 `--dsw-alias-bg-base`，不铺任何全屏画布/光斑/光泽层）。

主色调保持原版蓝白：品牌色、状态色、文字色全部沿用官方语义 token，一个都不改。

## 液态玻璃 ≠ 毛玻璃

上一版只做了 `backdrop-filter: blur()`，那是**毛玻璃**。苹果 Liquid Glass 的核心是
**棱边折射（lensing）**：玻璃边缘像透镜一样把背后的内容挤压、弯曲，配合方向性镜面高光。
两者观感差距主要就在这里。

本插件实现的折射链路（Chromium 专属能力，桌面端正是 Electron/Chromium）：

1. 按**斯涅尔定律**（空气 n=1 → 玻璃 n=1.5）在圆角矩形的棱边带内逐像素算出位移矢量，
   截面用苹果偏爱的**凸圆角（squircle）**函数 `y = (1-(1-x)^4)^{1/4}`，外缘折射最强、到棱边内侧归零；
2. 把位移矢量编码成图片：`R = 128 + Δx/最大位移×127`、`G = 128 + Δy/…`（128 为不动），
   用 canvas 生成 PNG data URL；
3. 组装成 SVG 滤镜 `<feImage>` + `<feDisplacementMap xChannelSelector="R" yChannelSelector="G" scale="最大位移">`；
4. 通过 `backdrop-filter: blur(6px) url(#滤镜) saturate(180%) brightness(1.04)` 施加——
   **先柔化、再折射**，棱边因此保持"透镜环"的结构而不是糊成一团；
5. 镜面棱边用 `mask-composite: exclude` 挖出 2px 环做方向性高光（左上最亮、右下次亮），
   另一层伪元素做顶光 + **指针跟随的镜面光斑**。

### 参考来源

- [Liquid Glass in the Browser: Refraction with CSS and SVG](https://kube.io/blog/liquid-glass-css-svg/)——位移贴图 + `feDisplacementMap` + `backdrop-filter: url()` 的完整推导（本文档的实现依据）
- [nikdelvin/liquid-glass](https://github.com/nikdelvin/liquid-glass)——iOS 26 液态玻璃的 CSS+SVG 复刻，含 LiquidGlass 容器/文字/按钮组件
- [childrentime/liquid-glass](https://github.com/childrentime/liquid-glass)——同方向实现与效果说明
- [Apple WWDC 2025: Meet Liquid Glass](https://www.youtube.com/watch?v=jGztGfRujSE)——设计语言原始出处
- 本地素材：`C:\HOME\Project\Clause OS\Clause OS Design System`（`.cos-liquid` 的镜面边 + 光泽扫光配方；
  注意它的全屏光斑画布**按用户要求未采用**）

关键限制（原文结论，与本插件一致）：**只有 Chromium 支持把 SVG 滤镜当 `backdrop-filter`**，
其他内核只能退回分层模糊。桌面端是 Electron → 可用；插件在运行时用
`CSS.supports('backdrop-filter','url(#x)')` 探测，不支持就自动降级为纯毛玻璃。
另外位移贴图**不会随元素尺寸自动伸缩**，所以尺寸变化要重建贴图（本插件按签名缓存，仅在尺寸/强度变化时重算）。

## 效果

| 表面 | 处理 |
|---|---|
| 对话框 / 弹层 | 棱边折射 + 毛玻璃 + 2px 镜面棱边 + 顶光；背后内容在边缘被透镜挤压 |
| 设置面板等大面板 | 同上 |
| 输入框卡片 | 同上（774×114 实测命中） |
| 卡片 | 走官方 `--dsw-alias-bg-layer-*` token 变半透 |
| 左侧栏 | 半透玻璃板 + 棱边亮线；列级容器**不开模糊**（该容器是 `position: static`，也没有可以安全借用的伪元素） |
| **页面背景 / 官方底色** | **完全不动**，与官方逐像素一致 |

## 使用

设置 →「通用设置」→ 最下方 **液态玻璃 · Liquid Glass**：

| 控件 | 作用 | 默认 |
|---|---|---|
| 液态玻璃（总开关） | 关掉即完全还原官方外观 | 开 |
| 棱边折射 Refraction | 折射开关；关掉退化为纯毛玻璃 | 开 |
| 折射强度 Strength | 棱边位移量倍率 0.4–3 | 1.5 |
| 毛玻璃模糊 Blur | 折射之外的柔化 0–16px | 6 |
| 玻璃不透明度 Opacity | 表面 alpha 系数 0.6–1.15 | 1 |

偏好存浏览器 `localStorage`（键 `dsh-glass-skin/prefs`）。改默认值改 `lib/client.js` 的 `DEFAULTS`。

## 安装（已完成，此处为复现说明）

桌面端由 Electron 托管 `desktop` profile，官方 CLI 会拒绝直接操作它
（`error: profile "desktop" is managed exclusively by the Electron application`），
因此用会话内的官方插件管理工具安装：

```jsonc
// plugin_manager { action: "install_bundle", target: "C:/HOME/Project/DSH plugins/dsh-glass-skin" }
```

手工等价做法（任何 profile 通用）：

```sh
dsh plugin --profile <name> add "/path/to/dsh-glass-skin"   # 官方命令，自动维护 bundles
dsh --profile <name> --dump-config | grep glass-skin        # 应出现 "# == dsh-glass-skin"
```

客户端半是浏览器 roster 项，装好后**刷新页面（Ctrl+R）**即生效，无需重启后端。
卸载：`plugin_manager { action: "remove_bundle", target: "dsh-glass-skin" }`。

## 实现（全部走官方扩展点）

| 层 | 用的官方机制 | 说明 |
|---|---|---|
| 颜色层 | `ctx.theme.overrideTokens(source, { token: { light, dark } })` | 只覆盖表面的语义别名（`bg-layer-1/2`、`bg-overlay`、`border-l1/l2`、`specific-sidebar-fill`）。**不含 `bg-base`**；label/brand/state 同样不动 |
| 材质层 | 自有 `<style data-plugin="dsh-glass-skin">` + 自有 `<svg>` 滤镜 | 折射、棱边、光泽；带 `data-plugin` 标记，卸载/HMR 自动清理 |
| 设置界面 | `ctx.slots.inject('settings.general.item')` + `@deepseek-ai/dsh-client-store` 的 `defineStore` | 与官方 ui-theme 的 Appearance 行同一套契约 |
| 打包 | `dsh.bundle.patch` + `dsh.client`（`platform: web`） | 官方组合包规范，无构建链、无 postinstall |

### 工程决策（都是踩过的坑）

1. **不硬编码官方 CSS 模块类名**（构建期哈希 `BynINW_*`，升级必废）。用官方 slot 的
   `[data-slot="…"]` 属性当锚点向上找真正上色的布局元素；对话框面板按"圆角 ≥10px + 有底色 + 尺寸收敛"识别，
   并跳过表单控件（否则会把对话框里的 `<input>` 错当成面板）。
2. **不给大列加 `backdrop-filter`**：它会让元素成为 `position: fixed` 后代的包含块，
   套在包含整个应用的大列上会改坏菜单/浮层定位。只在叶子表面加模糊，且跳过内部含 fixed 后代的 fixed 元素。
3. **伪元素只在空着时才借**：用 `getComputedStyle(el, '::before').content` 判断，并要求元素 `position !== 'static'`，
   避免改动官方元素的定位上下文。
4. **位移贴图按签名缓存**：DOM 重扫很频繁（MutationObserver + ResizeObserver，350ms 去抖），
   尺寸/强度没变时直接命中缓存，不重跑 canvas。
5. **SDF 梯度要带符号**：圆角矩形的外法线是 `grad = max(q,0)/|max(q,0)| × sign(p)`，
   漏掉 `sign(p)` 会让位移反向、把背景采样到元素外，表现为难看的拖影（实测踩过，导出位移贴图才定位到）。

### 无障碍

- `prefers-reduced-transparency: reduce` → 去掉折射、模糊、阴影与装饰层；
- 文字与状态色使用官方 token，未参与调色，对比度与官方一致。

## 目录

```
dsh-glass-skin/
├── package.json        # name/main/exports + dsh.bundle.patch + dsh.client
├── cordis.patch.yml    # 组合层：insert 一行 ui-glass-skin
├── lib/index.js        # Host 半：零依赖、零副作用（只为让客户端 bundle 进 roster）
├── lib/client.js       # Client 半：位移贴图 + SVG 滤镜 + 棱边/光泽 + 表面识别 + 设置行
└── README.md
```

## 已验证（可复现）

在隔离实例（临时 `DSH_HOME` + `--from-default-profile web`，与真实 profile 完全隔离）上：

1. `dsh --profile glasscheck --dump-config` → 出现 `# == dsh-glass-skin` 层；
2. **背景未改动**：`html` 无背景图、`--dsw-alias-bg-base` 仍为官方 `#fff`（深色 `#151517`）、
   `body` 计算背景 `rgb(255,255,255)` / `rgb(21,21,23)`；
3. 折射真的挂上：`CSS.supports('backdrop-filter','url(#x)')` = true，
   对话框 `backdrop-filter: blur(6px) url("#lg-refract-1") saturate(1.8) brightness(1.04)`，位移贴图 2.2KB；
4. **位移贴图方向经目视核对**：上绿（向下采样）、左粉（向右）、下紫（向上）、右青（向左）——全部指向内侧；
5. 功能：总开关 on→off→on、折射开关 on→off→on、强度滑块实时改变 `scale`（4.84→9.03）、
   开关切换后 `<filter>` 残留为 0（曾泄漏，已修）；
6. 明暗双模式 + 主界面/插件页/设置面板截图核对，零 console/page error。

## 已知限制

- 折射只在 Chromium 生效（Electron/桌面端 ✅）；其他内核自动退回毛玻璃；
- 位移贴图在元素**尺寸变化**时要重建（已按签名缓存 + 去抖，流式输出时不会每帧重算）；
- 左侧栏是 `position: static` 的大列：既不能开模糊（包含块副作用），也没有可安全借用的伪元素，
  因此它只有半透与棱边高光，玻璃感弱于对话框——这是"不改背景"+"不破坏布局"两条约束下的结果；
- 菜单材质沿用官方（官方菜单本身已是 `blur(40px) saturate(150%)`），本插件不覆盖
  `--dsw-menu-surface-fill` / `--dsw-menu-backdrop-filter`——官方样式规范明确禁止功能/平台 CSS 覆盖它们；
- 偏好存在浏览器本地，不随 profile 备份迁移；只改视觉，不新增工具、不联网、不读写项目文件。

## 许可

MIT
