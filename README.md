# dsh-glass-skin

给 DeepSeek Harness 桌面端/Web 界面做**半透液态玻璃**皮肤：**只把圆角矩形表面**——
对话框/弹层、卡片、输入框卡片、左侧栏——换成半透明玻璃 + 毛玻璃模糊，
**页面背景一律不动**（不覆盖 `--dsw-alias-bg-base`，不铺任何全屏画布、光斑或光泽层）。

主色调保持原版蓝白：品牌色、状态色、文字色全部沿用官方语义 token，一个都不改。

> 材质语言参考 `C:\HOME\Project\Clause OS` 设计系统的玻璃契约（顶部白色内发光高光边、
> 0.5px 棱边、柔和投影），但按用户要求**去掉了它的全屏光斑画布**。

## 效果

| 表面 | 处理 |
|---|---|
| 对话框 / 弹层 | 半透 + `blur(20px) saturate(180%)`，背后内容柔化透出，顶部一道镜面高光，28px 圆角 |
| 设置面板等大面板 | 同上，是观感最强的玻璃面 |
| 卡片（`.settings-card` 等） | 走官方 `--dsw-alias-bg-layer-*` token 变半透 |
| 输入框卡片 | 半透 + 模糊 + 内高光 + 棱边 |
| 左侧栏 | 半透玻璃板 + 右侧棱边亮线（列级容器**不开模糊**，见下） |
| **页面背景 / 标题栏底色** | **完全不动**，与官方逐像素一致 |

## 市场调研结论（为什么是自研）

数据源：插件市场目录 `awesome-dsh-plugin.com/plugins.json` + `readmes.json`
（2026-09-29 抓取，本地存档在 `../_research/`）。

- 目录共 **4382** 条，取到 **4369** 份 README；
- README **明确写"液态玻璃 / 毛玻璃 / glassmorphism / frosted glass"的有 89 条**，
  类目分布 theme 35、ui 26、usage 9、tools 5、fun 4、remote 3…… 方向很拥挤，
  但**没有一条**同时满足"苹果液态玻璃材质（镜面高光 + 棱边 + 圆角面板）+ 保留官方蓝白与官方背景"。

同类里最主流的几条（按热度）：

| 插件 | 热度 | 属于哪一类 | 为什么不直接采用 |
|---|---|---|---|
| `dsh-wallpaper-engine` | 384★ / 20.7k↓ | 壁纸引擎联动 | 解决"背景放什么"，不是玻璃材质；且强依赖 DSH ≥ 0.1.5-rc.1 |
| `dsh-dream-skin` | 192★ / 25.1k↓ | 换肤器（8 套主题 + 壁纸模糊） | 主题画廊范式，玻璃只是壁纸的附属开关 |
| `dsh-catppuccin-theme` | 49★ / 9.1k↓ | 配色主题 + 可开关玻璃皮肤 | 配色优先，玻璃是附加项，且会换掉整套配色 |
| `dsh-any-background` | 35★ / 5.2k↓ | 8 区域透明度 + 毛玻璃模糊 | 功能最接近，但是"逐区域调参工具"，没有液态玻璃的光学细节 |
| `dsh-kimino-theme` | 40★ | 动画主题（彗星蓝玻璃拟态） | 绑定具体 IP 的作品主题 |

（注：热度榜靠前的个别条目只是 README 里偶然提到 glass，不在上表。）

它们踩过的正路我都沿用：**走官方 `ctx.theme.overrideTokens` 与原生 `--dsw-*` token 系统**；
我没有沿用它们普遍采用的做法——连带把整套配色和背景一起换掉。

## 安装（已完成，此处为复现说明）

桌面端由 Electron 托管 `desktop` profile，官方 CLI 会拒绝直接操作它
（`error: profile "desktop" is managed exclusively by the Electron application`），
因此用会话内的官方插件管理工具安装：

```jsonc
// plugin_manager { action: "install_bundle", target: "C:/HOME/Project/DSH plugins/dsh-glass-skin" }
```

它做三件事（与官方文档一致）：profile `dependencies` 加 `link:` 依赖、
`dsh.profile.bundles` 追加本包、把本包 `cordis.patch.yml` 作为一层插入组合。

手工等价做法（任何 profile 通用）：

```sh
dsh plugin --profile <name> add "/path/to/dsh-glass-skin"   # 官方命令，自动维护 bundles
dsh --profile <name> --dump-config | grep glass-skin        # 应出现 "# == dsh-glass-skin"
```

客户端半是浏览器 roster 项，装好后**刷新页面（Ctrl+R）**即生效，无需重启后端。

卸载：`plugin_manager { action: "remove_bundle", target: "dsh-glass-skin" }`
（或 `dsh plugin --profile <name> remove dsh-glass-skin`）。

## 使用

设置 →「通用设置」→ 最下方的 **液态玻璃 · Liquid Glass** 一行：

| 控件 | 作用 | 默认 |
|---|---|---|
| 圆角面半透（开关） | 皮肤总开关（关掉即完全还原官方外观） | 开 |
| 毛玻璃模糊 Blur | `backdrop-filter` 模糊半径 0–40px | 20px |
| 玻璃不透明度 Opacity | 表面 alpha 系数 0.6–1.15，越小越通透 | 1 |

偏好存在浏览器 `localStorage`（键 `dsh-glass-skin/prefs`），刷新与重启后保持。
改默认值直接改 `lib/client.js` 里的 `DEFAULTS`。

## 实现（全部走官方扩展点）

| 层 | 用的官方机制 | 说明 |
|---|---|---|
| 颜色层 | `ctx.theme.overrideTokens(source, { token: { light, dark } })` | 只覆盖 5 个"面"的语义别名：`bg-layer-1`/`bg-layer-2`/`bg-overlay`/`border-l1`/`border-l2`，以及 `specific-sidebar-fill`。**不含 `bg-base`**——背景保持官方；label/brand/state 同样不动 |
| 材质层 | 自有 `<style data-plugin="dsh-glass-skin">` | `backdrop-filter`、内高光、棱边、投影；带 `data-plugin` 标记，卸载/HMR 自动清理 |
| 设置界面 | `ctx.slots.inject('settings.general.item')` + `@deepseek-ai/dsh-client-store` 的 `defineStore` | 与官方 ui-theme 的 Appearance 行同一套契约 |
| 打包 | `dsh.bundle.patch` + `dsh.client`（`platform: web`） | 官方组合包（bundle）规范，无构建链、无 postinstall |

### 三个关键工程决策

1. **背景绝不改动**。不覆盖 `--dsw-alias-bg-base`、不在 `html`/`body` 上铺任何背景，
   也没有全屏光泽层——这是用户明确要求的边界，代价是"玻璃只在自己的棱边和内高光上被看见"。
2. **不硬编码官方 CSS 模块类名**。官方类名是构建期哈希（`BynINW_sidebarCol`、`Dc7zOa_*`），
   版本一升就失效。皮肤用官方 slot 渲染出的 `[data-slot="…"]` 属性做锚点，
   向上找到真正上色的布局元素；对话框面板按"圆角 ≥10px + 有底色 + 尺寸收敛"识别。
3. **不给大列加 `backdrop-filter`**。它会让元素成为 `position: fixed` 后代的包含块，
   套在包含整个应用的大列上会把菜单/浮层定位改坏。所以：
   - 左侧栏等列级容器 ＝ 半透明填充 + 棱边高光（无模糊）；
   - 只有小尺度叶子表面（对话框面板、卡片、输入框卡片）才加模糊，
     并且跳过表单控件（否则会把输入框错认成面板）、跳过内部含 fixed 后代的 fixed 元素。

### 无障碍

- `prefers-reduced-transparency: reduce` → 去掉模糊与全部阴影，只留半透明；
- 文字与状态色使用官方 token，未参与调色，对比度与官方一致。

## 目录

```
dsh-glass-skin/
├── package.json        # name/main/exports + dsh.bundle.patch + dsh.client
├── cordis.patch.yml    # 组合层：insert 一行 ui-glass-skin
├── lib/index.js        # Host 半：零依赖、零副作用（只为让客户端 bundle 进 roster）
├── lib/client.js       # Client 半：颜色层 + 材质层 + 表面识别 + 设置行（手写 ModuleLoader bundle）
└── README.md
```

## 已验证（可复现）

在隔离实例（临时 `DSH_HOME` + `--from-default-profile web`，与用户真实 profile 完全隔离）上：

1. `dsh --profile glasscheck --dump-config` → 出现 `# == dsh-glass-skin` 层；
2. **背景未改动**的机器可核证据：`html` 无背景图、`--dsw-alias-bg-base` 仍为官方 `#fff`、
   `body` 计算背景 `rgb(255,255,255)`、页面无任何全屏叠加层；
3. 表面命中：`sidebar`（280×900，半透、不模糊）、`composer`（774×114，28px 圆角，模糊生效）、
   `dialog`（600×256，28px 圆角，模糊生效）；
4. 功能：开关 off→on 双向可用、模糊滑块即时生效、刷新后偏好保持；
5. 明暗双模式与多页面（主界面 / 插件页 / 设置面板）渲染核对，零 console/page error。

## 已知限制

- 背景是官方纯色，玻璃的"透光"主要靠背后滚动的正文内容体现（对话框/面板最明显）；
  左侧栏背后没有内容，因此它主要表现为棱边高光——这是"不改背景"的必然结果；
- 菜单材质沿用官方（官方菜单本身已是 `blur(40px) saturate(150%)`），本插件不覆盖
  `--dsw-menu-surface-fill` / `--dsw-menu-backdrop-filter`——官方样式规范明确禁止功能/平台 CSS 覆盖它们；
- 偏好存在浏览器本地，不随 profile 备份迁移；
- 只改视觉，不新增工具、不联网、不读写项目文件。

## 许可

MIT
