/**
 * dsh-glass-skin —— Client 半（浏览器侧皮肤）。
 *
 * 设计契约（与 README 一致）：
 *  1. 颜色层走官方扩展点 `ctx.theme.overrideTokens(source, {token:{light,dark}})`，
 *     只覆盖官方语义别名 token，保留原版蓝白色阶（label / brand / state 一律不动）。
 *  2. 材质层（backdrop-filter、内高光、折射边、指针光泽）由本插件自己的
 *     <style data-plugin="dsh-glass-skin"> 提供，卸载/HMR 时按 dataset.plugin 清理。
 *  3. 表面靠"稳定契约"定位：官方 slot 会渲染出 [data-slot="<key>"] 属性，另有
 *     实测的 [data-pane="sidebar"]；CSS 模块类名是构建期哈希（如 BynINW_root），
 *     绝不在选择器里硬编码，并额外提供一层"按布局特征自愈"的兜底识别。
 *  4. 布局安全：backdrop-filter 会让元素成为 position:fixed 后代的包含块，
 *     因此只用在小尺度的叶子表面上（输入框卡片、对话框、浮层卡片）；
 *     大列（侧栏/中栏/右栏）只做半透明与描边高光，不加模糊。
 *
 * 无构建链：手写 ModuleLoader bundle，只依赖 react（可选 dsh-client-store）。
 */

window.__ModuleLoader__.load({
	id: 'dsh-glass-skin',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		const React = require('react')

		/** 插件 id：同时用作 CSS 清理标记、主题覆盖层 source、行 id。 */
		const PLUGIN_ID = 'dsh-glass-skin'
		/** 样式表标记，HMR 依据它清理旧样式。 */
		const CSS_TAG_ID = PLUGIN_ID + '/skin.css'
		/** 标在官方表面元素上的属性名（只加属性，不改 class、不改结构）。 */
		const MARK = 'data-lg-glass'
		/** 皮肤总开关属性：挂在 html 上，所有规则都以它为前缀。 */
		const ROOT_FLAG = 'data-lg-skin'
		/** 偏好存储键（浏览器本地，刷新与重启后保持）。 */
		const PREF_KEY = 'dsh-glass-skin/prefs'

		/** 默认偏好：开箱即用的液态玻璃观感。 */
		const DEFAULTS = {
			enabled: true, // 总开关
			blur: 22, // 毛玻璃模糊半径 px
			opacity: 1, // 表面不透明度系数 0.6~1.15（越小越通透）
			ambient: true, // 环境光画布（玻璃"透光"的前提）
			sheen: true // 指针跟随镜面光泽
		}

		/* ------------------------------------------------------------------ *
		 * 偏好读写
		 * ------------------------------------------------------------------ */

		function readPrefs() {
			try {
				const raw = localStorage.getItem(PREF_KEY)
				if (raw === null) return { ...DEFAULTS }
				const parsed = JSON.parse(raw)
				return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
			} catch {
				return { ...DEFAULTS }
			}
		}

		function writePrefs(prefs) {
			try {
				localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
			} catch {
				/* 隐私模式等场景下静默降级：皮肤仍生效，只是不持久化 */
			}
		}

		/* ------------------------------------------------------------------ *
		 * 颜色层：官方 token 覆盖（只动表面与描边，不动文字/品牌/状态色）
		 * ------------------------------------------------------------------ */

		/** 官方深色表面基色（neutral-bluish 系），保持原版冷调。 */
		const DARK_SURFACE = '18, 21, 29'

		/**
		 * 由偏好推导官方别名 token 的明暗两套取值。
		 * @param prefs 当前偏好。
		 * @returns `{ '--dsw-alias-*': { light, dark } }`
		 */
		function buildTokens(prefs) {
			// 系数只影响不透明度，色相始终是官方蓝白
			const k = Math.min(1.15, Math.max(0.5, Number(prefs.opacity) || 1))
			const w = (a) => `rgba(255, 255, 255, ${+(a * k).toFixed(3)})`
			const d = (a) => `rgba(${DARK_SURFACE}, ${+(a * k).toFixed(3)})`
			return {
				// 应用基色：body 与布局 frame 会各刷一遍，两层叠加才是实际纱罩，
				// 所以这里的 alpha 要小（0.2 × 2 层 ≈ 0.36 纱罩），否则背后光斑被糊死。
				'--dsw-alias-bg-base': { light: w(0.2), dark: d(0.24) },
				// 一级抬升面：侧栏卡片、面板
				'--dsw-alias-bg-layer-1': { light: w(0.4), dark: d(0.4) },
				// 二级嵌套面：卡片内卡片、输入框
				'--dsw-alias-bg-layer-2': { light: w(0.56), dark: d(0.56) },
				// 浮层/弹层：要能看清字，但仍是玻璃
				'--dsw-alias-bg-overlay': { light: w(0.7), dark: d(0.74) },
				// 描边：半透明白/墨，官方要求中性描边 0.5px，这里只换颜色不改宽度
				'--dsw-alias-border-l1': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' },
				'--dsw-alias-border-l2': { light: 'rgba(15, 23, 42, 0.1)', dark: 'rgba(255, 255, 255, 0.15)' },
				// 侧栏专用填充（官方 token，DeepSeek 侧栏列的背景）
				'--dsw-specific-sidebar-fill': { light: w(0.2), dark: d(0.22) }
			}
		}

		/* ------------------------------------------------------------------ *
		 * 样式表：环境光 + 玻璃材质 + 高光边 + 折射 + 光泽层
		 * ------------------------------------------------------------------ */

		const SKIN_CSS = `
/* ============ dsh-glass-skin：苹果液态玻璃 + 毛玻璃（原版蓝白主色） ============ */

/* 默认（浅色）：冷调蓝白画布 + DeepSeek 蓝光斑。
   玻璃"透光"的前提是背后有可透的光斑，所以光斑刻意做足（Clause OS 配方结论）。 */
html[data-lg-skin='on'] {
  --lg-canvas: #e8effb;
  --lg-glow-a: rgba(65, 118, 230, 0.28);
  --lg-glow-b: rgba(96, 165, 250, 0.3);
  --lg-glow-c: rgba(30, 64, 175, 0.14);
  --lg-blob-light: rgba(255, 255, 255, 0.9);
  --lg-edge: rgba(255, 255, 255, 0.95);
  --lg-edge-soft: rgba(255, 255, 255, 0.55);
  --lg-hair: rgba(255, 255, 255, 0.6);
  background-color: var(--lg-canvas);
  background-image:
    radial-gradient(44% 36% at 4% 0%, var(--lg-blob-light), transparent 58%),
    radial-gradient(58% 48% at 12% 6%, var(--lg-glow-a), transparent 64%),
    radial-gradient(52% 44% at 94% 6%, var(--lg-glow-b), transparent 66%),
    radial-gradient(84% 64% at 50% 114%, var(--lg-glow-c), transparent 70%);
  background-attachment: fixed;
  background-repeat: no-repeat;
}

/* 深色：近黑冷调画布 + 更亮的蓝光斑（保持官方深色底 #151517 的调性） */
html[data-lg-skin='on']:has(body[data-ds-dark-theme]) {
  --lg-canvas: #0a0e16;
  --lg-glow-a: rgba(65, 118, 230, 0.48);
  --lg-glow-b: rgba(122, 170, 255, 0.32);
  --lg-glow-c: rgba(37, 99, 235, 0.26);
  --lg-blob-light: rgba(122, 170, 255, 0.15);
  --lg-edge: rgba(255, 255, 255, 0.34);
  --lg-edge-soft: rgba(255, 255, 255, 0.14);
  --lg-hair: rgba(255, 255, 255, 0.1);
}

/* 关闭环境光：回到官方不透明画布，玻璃面变成半透明纯色 */
html[data-lg-skin='on'][data-lg-ambient='off'] {
  background-image: none;
  background-color: var(--lg-canvas);
}
html[data-lg-skin='on'][data-lg-ambient='off']:has(body[data-ds-dark-theme]) {
  background-color: #151517;
}

/* ---- 玻璃表面：小尺度叶子表面才有模糊（布局安全） ---- */
html[data-lg-skin='on'] [${MARK}='glass'] {
  /* 卡片自身底色也调通透：官方若用不透明白，模糊再强也看不出玻璃 */
  background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
  -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(185%) brightness(1.06);
  backdrop-filter: blur(var(--lg-blur)) saturate(185%) brightness(1.06);
  box-shadow:
    inset 0 1.5px 0 var(--lg-edge),
    inset 0 -0.5px 0 var(--lg-edge-soft),
    inset 0 0 0 0.5px var(--lg-hair),
    var(--dsw-elevation-soft);
}

/* ---- 大列/工具条：只做描边高光与顶部内发光，不加模糊 ---- */
html[data-lg-skin='on'] [${MARK}='chrome'] {
  box-shadow:
    inset 0 1px 0 var(--lg-edge-soft),
    inset 0 0 0 0.5px var(--lg-hair);
}

/* 侧栏：右侧竖向高光，模拟玻璃棱边的折射亮线 */
html[data-lg-skin='on'] [${MARK}='sidebar'] {
  box-shadow:
    inset 0 1px 0 var(--lg-edge),
    inset -1px 0 0 var(--lg-edge),
    inset 0 0 0 0.5px var(--lg-hair);
}

/* 玻璃卡片：顶部那道更亮的镜面线已并入上面的 glass 规则（刻意不用 ::after /
   position，避免改到官方元素的包含块与定位） */

/* ---- 指针跟随光泽层（插件自有元素，pointer-events: none，不干扰官方 DOM） ---- */
html[data-lg-skin='on'] #dsh-glass-sheen {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
  background: radial-gradient(
    620px circle at var(--lg-x, 50%) var(--lg-y, 0%),
    rgba(255, 255, 255, var(--lg-sheen, 0.1)),
    rgba(255, 255, 255, 0) 58%
  );
}
html[data-lg-skin='on']:has(body[data-ds-dark-theme]) #dsh-glass-sheen {
  background: radial-gradient(
    620px circle at var(--lg-x, 50%) var(--lg-y, 0%),
    rgba(122, 170, 255, var(--lg-sheen, 0.1)),
    rgba(122, 170, 255, 0) 58%
  );
}
html[data-lg-skin='on'] #dsh-glass-sheen[data-visible='true'] { opacity: 1; }

/* ---- 无障碍：尊重系统"减少透明度"与"减少动态效果" ---- */
@media (prefers-reduced-transparency: reduce) {
  html[data-lg-skin='on'] [${MARK}] {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }
  html[data-lg-skin='on'] #dsh-glass-sheen { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  html[data-lg-skin='on'] #dsh-glass-sheen { transition: none; }
}
`

		/** 注入样式表（带 data-plugin，随插件卸载/HMR 自动清理）。 */
		function installStyles() {
			if (document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`) !== null) return
			const tag = document.createElement('style')
			tag.dataset.plugin = PLUGIN_ID
			tag.dataset.pluginCss = CSS_TAG_ID
			tag.textContent = SKIN_CSS
			document.head.appendChild(tag)
		}

		/* ------------------------------------------------------------------ *
		 * 表面识别：稳定契约优先，布局特征兜底（官方改类名/属性也不会瞎）
		 * ------------------------------------------------------------------ */

		/** 需要描边高光的大列（侧栏单独处理，因为它的官方填充 token 不同）。 */
		const SLOT_ANCHORS = [
			['[data-slot="conversation.session"]', 'chrome'],
			['[data-slot="rightbar"]', 'chrome']
		]
		/** 需要玻璃模糊的容器：只在其内部小尺度叶片上打标，避免包含块副作用。 */
		const GLASS_HOSTS = ['[data-slot="conversation.composer.bar"]', '[role="dialog"]', '[data-slot="shell.overlay"]']

		/** 视口面积占比，用于兜底判断"这是一块布局面"。 */
		function viewportShare(el) {
			const vw = window.innerWidth || 1
			const vh = window.innerHeight || 1
			return { w: el.offsetWidth / vw, h: el.offsetHeight / vh }
		}

		/**
		 * 槽位标记元素是 `display: contents` 的零尺寸容器，真正上色的列是它外面的
		 * 布局元素（官方 CSS 模块类，类名逐版本变化，不可硬编码）。
		 * 因此从标记向上找"有尺寸且确实画了底色"的祖先——这是布局契约，不依赖类名。
		 * @param marker 槽位标记元素。
		 * @param minHeightShare 祖先至少要占视口高度的比例，避免误标到整窗容器。
		 * @returns 找到的祖先，找不到返回 null。
		 */
		function paintedAncestor(marker, minHeightShare) {
			const vh = window.innerHeight || 1
			let el = marker?.parentElement ?? null
			for (let hop = 0; el && hop < 4; el = el.parentElement, hop += 1) {
				if (el.offsetWidth === 0 || el.offsetHeight < vh * minHeightShare) continue
				const bg = getComputedStyle(el).backgroundColor
				if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return el
			}
			return null
		}

		/**
		 * 找出"实际绘制了背景的大块布局元素"。
		 * 官方若改名/改结构，稳定锚点会失效——这条兜底让皮肤自愈。
		 */
		function scanChrome() {
			const out = []
			const root = document.body
			if (!root) return out
			const queue = [...root.children]
			let depth = 0
			while (queue.length > 0 && depth < 3) {
				const next = []
				for (const el of queue) {
					if (el.id === 'dsh-glass-sheen') continue
					const { w, h } = viewportShare(el)
					if (w > 0.22 && h > 0.45) {
						const bg = getComputedStyle(el).backgroundColor
						if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') out.push({ el, w, h })
					}
					next.push(...el.children)
				}
				queue.length = 0
				queue.push(...next.slice(0, 80))
				depth += 1
			}
			return out
		}

		/**
		 * 判断元素内部是否已有 fixed 定位的后代。给 fixed 元素加 backdrop-filter
		 * 会改变这些后代的包含块，所以命中就放弃模糊——宁可少糊一层，不可弄坏布局。
		 */
		function hasFixedDescendant(el) {
			let checked = 0
			for (const node of el.querySelectorAll('*')) {
				if (++checked > 400) return false
				if (getComputedStyle(node).position === 'fixed') return true
			}
			return false
		}

		/**
		 * 在小尺度宿主里找出"卡片状"叶片（有圆角、有底色、尺寸收敛），
		 * 只有这类元素才安全地加 backdrop-filter。
		 */
		function scanGlassLeaves(host) {
			const out = []
			const vh = window.innerHeight || 1
			for (const el of host.querySelectorAll('*')) {
				if (el.offsetWidth < 200 || el.offsetHeight < 32) continue
				if (el.offsetHeight > vh * 0.7) continue
				const cs = getComputedStyle(el)
				const radius = parseFloat(cs.borderTopLeftRadius) || 0
				if (radius < 10) continue
				if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue
				// fixed 的对话框面板本身允许上玻璃，但内部还有 fixed 后代就跳过
				if (cs.position === 'fixed' && hasFixedDescendant(el)) continue
				out.push(el)
			}
			// 只取最大的那个：嵌套卡片重复模糊会糊成一片
			return out.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight).slice(0, 1)
		}

		/** 打标：只写属性，不碰 class、结构与行内样式。 */
		function mark(el, kind) {
			if (!el || el === document.body || el === document.documentElement) return
			if (el.hasAttribute(MARK) && el.getAttribute(MARK) === kind) return
			el.setAttribute(MARK, kind)
			el.setAttribute('data-lg-owner', PLUGIN_ID)
		}

		/** 清掉本插件打过的全部标记。 */
		function clearMarks() {
			for (const el of document.querySelectorAll(`[data-lg-owner="${PLUGIN_ID}"]`)) {
				el.removeAttribute(MARK)
				el.removeAttribute('data-lg-owner')
			}
		}

		/**
		 * 解析并标记当前页面上的玻璃表面。增量式：只补缺失的标记、只清理已断开的
		 * 标记，因此可以随 DOM 变化反复调用（对话框、面板是后出现的）。
		 */
		function resolveSurfaces() {
			try {
				// 被 React 换掉的节点：标记跟着失效，清掉
				for (const el of document.querySelectorAll(`[${MARK}]`)) {
					if (!el.isConnected) {
						el.removeAttribute(MARK)
						el.removeAttribute('data-lg-owner')
					}
				}
				// 1) 侧栏：官方 slot 标记（display:contents 零尺寸）-> 上溯到真正上色的列
				if (document.querySelector(`[${MARK}='sidebar']`) === null) {
					const sideMarker =
						document.querySelector('[data-slot="sidebar"]') ?? document.querySelector('[data-pane="sidebar"]')
					const sideCol = paintedAncestor(sideMarker, 0.5)
					if (sideCol) mark(sideCol, 'sidebar')
					else {
						// 兜底：官方改结构时按"绘制了底色的大块布局元素"自己找列
						const cols = scanChrome().sort((a, b) => b.h * b.w - a.h * a.w)
						for (const { el, w } of cols.slice(0, 3)) mark(el, w < 0.34 ? 'sidebar' : 'chrome')
					}
				}
				// 2) 中栏/右栏：同样上溯
				for (const [selector, kind] of SLOT_ANCHORS) {
					if (document.querySelector(`[${MARK}='${kind}']`) !== null) continue
					const col = paintedAncestor(document.querySelector(selector), 0.5)
					if (col) mark(col, kind)
				}
				// 3) 玻璃叶片：每轮都补标（输入框卡片、对话框面板、浮层卡片）
				for (const host of GLASS_HOSTS) {
					for (const el of document.querySelectorAll(host)) {
						for (const leaf of scanGlassLeaves(el)) mark(leaf, 'glass')
					}
				}
			} catch (error) {
				console.warn('[dsh-glass-skin] 表面识别失败（皮肤仍以 token 层生效）', error)
			}
		}

		/* ------------------------------------------------------------------ *
		 * 指针光泽层（自有元素，绝不插进官方 DOM 结构里）
		 * ------------------------------------------------------------------ */

		const SHEEN_ID = 'dsh-glass-sheen'

		function installSheen() {
			let el = document.getElementById(SHEEN_ID)
			if (!el) {
				el = document.createElement('div')
				el.id = SHEEN_ID
				el.setAttribute('aria-hidden', 'true')
				document.body.appendChild(el)
			}
			return el
		}

		function removeSheen() {
			document.getElementById(SHEEN_ID)?.remove()
		}

		/* ------------------------------------------------------------------ *
		 * 应用/回收：所有副作用都登记在 ctx.effect 里，卸载自动还原
		 * ------------------------------------------------------------------ */

		/**
		 * 把一份偏好应用到页面。
		 * @returns 一个"应用下一份偏好"的函数（同一次挂载内热更新用）。
		 */
		function createApplier(ctx) {
			const root = document.documentElement
			let tokenDispose = null

			const applyVars = (prefs) => {
				root.style.setProperty('--lg-blur', `${Number(prefs.blur) || 0}px`)
				root.style.setProperty('--lg-sheen', prefs.sheen ? '0.14' : '0')
			}

			const applyTokens = (prefs) => {
				try {
					tokenDispose?.()
					tokenDispose = ctx.theme.overrideTokens(PLUGIN_ID, buildTokens(prefs))
				} catch (error) {
					console.warn('[dsh-glass-skin] token 覆盖层注册失败', error)
				}
			}

			const applier = (prefs) => {
				const on = prefs.enabled === true
				root.setAttribute(ROOT_FLAG, on ? 'on' : 'off')
				root.setAttribute('data-lg-ambient', prefs.ambient ? 'on' : 'off')
				if (!on) {
					tokenDispose?.()
					tokenDispose = null
					clearMarks()
					removeSheen()
					return
				}
				installStyles()
				applyVars(prefs)
				applyTokens(prefs)
				resolveSurfaces()
				if (prefs.sheen) installSheen()
				else removeSheen()
			}

			applier.dispose = () => {
				tokenDispose?.()
				tokenDispose = null
				clearMarks()
				removeSheen()
				root.removeAttribute(ROOT_FLAG)
				root.removeAttribute('data-lg-ambient')
				for (const name of ['--lg-blur', '--lg-sheen']) root.style.removeProperty(name)
				document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`)?.remove()
			}
			return applier
		}

		/* ------------------------------------------------------------------ *
		 * 设置行（官方 settings.general.item 插槽）
		 * ------------------------------------------------------------------ */

		/** 无官方 store 时的降级实现：只保证行能渲染，不影响皮肤本体。 */
		function fallbackStore(initial) {
			const listeners = new Set()
			let state = initial
			return {
				init: state,
				get: () => state,
				subscribe: (fn) => {
					listeners.add(fn)
					return () => listeners.delete(fn)
				},
				set: (next) => {
					state = next
					for (const fn of listeners) fn()
				}
			}
		}

		/**
		 * 设置行组件。整个渲染体包在 try/catch 里：官方 Settings 列表是共享插槽，
		 * 第三方行抛错会波及整页设置，所以失败时退化为一行纯文本而不是把页面带崩。
		 */
		function GlassSettingsRow(props) {
			try {
				return renderGlassSettingsRow(props)
			} catch (error) {
				console.warn('[dsh-glass-skin] 设置行渲染失败，已降级为纯文本', error)
				return React.createElement(
					'div',
					{ style: { fontSize: 13, padding: '4px 0' } },
					'液态玻璃 Liquid Glass（设置界面不可用，皮肤仍在生效）'
				)
			}
		}

		function renderGlassSettingsRow(props) {
			const prefs = props.useStore ? props.useStore((s) => s.prefs) : DEFAULTS
			const setPref = props.setPref ?? (() => {})
			const row = (label, control) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 } },
					React.createElement('div', { style: { flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, label),
					control
				)
			const toggle = (key) =>
				React.createElement(
					'button',
					{
						type: 'button',
						'aria-pressed': prefs[key] === true,
						onClick: () => setPref({ [key]: !prefs[key] }),
						style: {
							minWidth: 64,
							height: 26,
							padding: '0 12px',
							borderRadius: 13,
							border: '0.5px solid var(--dsw-alias-border-l2)',
							background: prefs[key] ? 'var(--dsw-alias-state-business-tertiary, rgba(65,118,230,.14))' : 'transparent',
							color: prefs[key] ? 'var(--dsw-alias-state-business-primary, #4176e6)' : 'var(--dsw-alias-label-secondary)',
							cursor: 'pointer'
						}
					},
					prefs[key] ? '开 On' : '关 Off'
				)
			const slider = (key, min, max, step) =>
				React.createElement('input', {
					type: 'range',
					min,
					max,
					step,
					value: prefs[key],
					onChange: (e) => setPref({ [key]: Number(e.target.value) }),
					style: { width: 132, accentColor: 'var(--dsw-alias-state-business-primary, #4176e6)' }
				})
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 8px' } },
				row('液态玻璃 · Liquid Glass', toggle('enabled')),
				row('毛玻璃模糊 Blur', slider('blur', 0, 40, 1)),
				row('表面不透明度 Opacity', slider('opacity', 0.6, 1.15, 0.05)),
				row('环境光画布 Ambient', toggle('ambient')),
				row('指针光泽 Sheen', toggle('sheen'))
			)
		}

		/**
		 * 注册设置行。任何一步失败都只损失"设置界面"，皮肤本身不受影响。
		 *
		 * 注意 `inject` 的用法：官方插槽在挂载时回调 `inject(actions)`，行组件要拿到
		 * 新快照必须通过这个 actions 写回 store（ui-theme 的 AppearanceRow 同样如此）。
		 * 直接调用 store 对象上的同名方法不会驱动重渲染——这是本插件实测踩过的坑。
		 *
		 * @param ctx 客户端上下文。
		 * @param store 行状态容器。
		 * @param injected 官方 inject 回调：(actions) => 额外 props。
		 */
		function registerSettingsRow(ctx, store, injected) {
			try {
				ctx.slots.inject('settings.general.item', () =>
					ctx.slots.register(
						{
							name: 'settings.general.item',
							id: 'liquid-glass',
							order: 30,
							store,
							inject: injected
						},
						GlassSettingsRow
					)
				)
			} catch (error) {
				console.warn('[dsh-glass-skin] 设置行注册失败（皮肤不受影响）', error)
			}
		}

		/* ------------------------------------------------------------------ *
		 * 插件主体
		 * ------------------------------------------------------------------ */

		/** 需要的客户端服务：主题覆盖栈 + 插槽。 */
		const inject = ['theme', 'slots']

		function apply(ctx) {
			installStyles()
			const applier = createApplier(ctx)
			let prefs = readPrefs()
			/** 官方插槽注入的 store 写入口（挂载时才有值）。 */
			let bound = null
			const store = createStore(prefs)

			/** 唯一的写路径：存偏好 -> 立即应用 -> 回填设置行。 */
			const setPref = (patch) => {
				prefs = { ...prefs, ...patch }
				writePrefs(prefs)
				applier(prefs)
				try {
					if (bound !== null) bound.sync(prefs)
					else if (typeof store.set === 'function') store.set({ prefs })
				} catch (error) {
					console.warn('[dsh-glass-skin] 设置行回填失败', error)
				}
			}

			/** 官方 inject 回调：拿到 actions 时先把当前偏好同步过去。 */
			const injected = (actions) => {
				bound = actions
				try {
					bound.sync(prefs)
				} catch (error) {
					console.warn('[dsh-glass-skin] 初始偏好回填失败', error)
				}
				return { setPref }
			}

			// 首次应用 + 生命周期回收（卸载/HMR 时把页面还原成官方外观）
			ctx.effect(() => {
				applier(prefs)
				return () => applier.dispose()
			}, 'glass-skin: 应用与还原')

			// 表面重扫：视口变化与 DOM 大改之后重新识别（React 会替换节点）
			ctx.effect(() => {
				let timer = null
				const schedule = () => {
					if (timer !== null) return
					timer = setTimeout(() => {
						timer = null
						if (prefs.enabled) resolveSurfaces()
					}, 400)
				}
				const observer = new MutationObserver(schedule)
				observer.observe(document.body, { childList: true, subtree: true })
				window.addEventListener('resize', schedule)
				return () => {
					observer.disconnect()
					window.removeEventListener('resize', schedule)
					if (timer !== null) clearTimeout(timer)
				}
			}, 'glass-skin: 表面重扫')

			// 指针光泽：只更新自有光泽层的位置，不触碰官方节点
			ctx.effect(() => {
				const onMove = (event) => {
					if (!prefs.sheen) return
					const el = document.getElementById(SHEEN_ID)
					if (!el) return
					el.dataset.visible = 'true'
					el.style.setProperty('--lg-x', `${event.clientX}px`)
					el.style.setProperty('--lg-y', `${event.clientY}px`)
				}
				const onLeave = () => {
					const el = document.getElementById(SHEEN_ID)
					if (el) el.dataset.visible = 'false'
				}
				document.addEventListener('pointermove', onMove, { passive: true })
				document.addEventListener('pointerleave', onLeave, { passive: true })
				return () => {
					document.removeEventListener('pointermove', onMove)
					document.removeEventListener('pointerleave', onLeave)
				}
			}, 'glass-skin: 指针光泽')

			// 设置行：把写入口交给官方插槽
			registerSettingsRow(ctx, store, injected)
		}

		/** 官方 defineStore 可用就用官方的，否则用等价降级实现。 */
		let defineStore = null
		try {
			defineStore = require('@deepseek-ai/dsh-client-store').defineStore
		} catch {
			defineStore = null
		}

		function createStore(prefs) {
			if (typeof defineStore === 'function') {
				try {
					return defineStore({
						init: () => ({ prefs }),
						actions: {
							sync: (draft, next) => {
								draft.prefs = next
							}
						}
					})
				} catch (error) {
					console.warn('[dsh-glass-skin] defineStore 不可用，改用降级 store', error)
				}
			}
			return fallbackStore({ prefs })
		}

		exports.apply = apply
		exports.inject = inject
		return module.exports
	}
})
