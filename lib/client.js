/**
 * dsh-glass-skin —— Client 半（浏览器侧皮肤）。
 *
 * 作用范围（2026-09-29 收敛后的契约，用户明确要求）：
 *   ✅ 圆角矩形表面：对话框/弹层、卡片、输入框卡片、左侧栏与其标题行 → 半透液态玻璃
 *   ❌ 页面背景：一律不动（不覆盖 --dsw-alias-bg-base，不铺任何全屏画布/光斑/光泽层）
 *
 * 三层实现：
 *  1. 颜色层走官方扩展点 `ctx.theme.overrideTokens(source, {token:{light,dark}})`，
 *     只覆盖"表面与描边"的语义别名；label/brand/state/bg-base 一律不动，
 *     因此文字对比度与原版背景色都保持官方值。
 *  2. 材质层（backdrop-filter、内高光、棱边亮线、柔和投影）由本插件自己的
 *     <style data-plugin="dsh-glass-skin"> 提供，卸载/HMR 按 data-plugin 清理。
 *  3. 表面靠"稳定契约"定位：官方 slot 会渲染出 [data-slot="<key>"] 标记；
 *     官方 CSS 模块类名是构建期哈希（BynINW_*），绝不硬编码。
 *
 * 布局安全：backdrop-filter 会让元素成为 position:fixed 后代的包含块，
 * 所以只加在小尺度叶子表面（对话框面板、卡片、输入框），列级容器只做
 * 半透明 + 描边高光，绝不在列上开模糊。
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

		/** 插件 id：同时用作 CSS 清理标记、主题覆盖层 source、设置行 id。 */
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
			blur: 20, // 毛玻璃模糊半径 px
			opacity: 1 // 表面不透明度系数 0.6~1.15（越小越通透）
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
				/* 隐私模式等场景静默降级：皮肤仍生效，只是不持久化 */
			}
		}

		/* ------------------------------------------------------------------ *
		 * 颜色层：官方 token 覆盖（只动"面"，不动"底"与文字）
		 * ------------------------------------------------------------------ */

		/** 官方深色表面基色（neutral-bluish 系），保持原版冷调。 */
		const DARK_SURFACE = '22, 26, 35'

		/**
		 * 由偏好推导官方别名 token 的明暗两套取值。
		 * 刻意不含 --dsw-alias-bg-base / label / brand / state：
		 * 背景与文字必须保持官方外观。
		 * @param prefs 当前偏好。
		 * @returns `{ '--dsw-alias-*': { light, dark } }`
		 */
		function buildTokens(prefs) {
			const k = Math.min(1.15, Math.max(0.5, Number(prefs.opacity) || 1))
			const w = (a) => `rgba(255, 255, 255, ${+(a * k).toFixed(3)})`
			const d = (a) => `rgba(${DARK_SURFACE}, ${+(a * k).toFixed(3)})`
			return {
				// 一级抬升面：面板、卡片
				'--dsw-alias-bg-layer-1': { light: w(0.6), dark: d(0.58) },
				// 二级嵌套面：卡片、输入框
				'--dsw-alias-bg-layer-2': { light: w(0.68), dark: d(0.66) },
				// 浮层/弹层：要比卡片更实一点，保证读得清
				'--dsw-alias-bg-overlay': { light: w(0.76), dark: d(0.78) },
				// 描边：半透明白/墨（只换颜色，不改官方 0.5px 宽度约定）
				'--dsw-alias-border-l1': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' },
				'--dsw-alias-border-l2': { light: 'rgba(15, 23, 42, 0.1)', dark: 'rgba(255, 255, 255, 0.15)' },
				// 侧栏专用填充：官方 token，做成半透玻璃板
				'--dsw-specific-sidebar-fill': { light: w(0.7), dark: d(0.72) }
			}
		}

		/* ------------------------------------------------------------------ *
		 * 样式表：只在被标记的表面上生效
		 * ------------------------------------------------------------------ */

		const SKIN_CSS = `
/* ============ dsh-glass-skin：圆角矩形 → 半透液态玻璃（背景不动） ============ */

html[data-lg-skin='on'] {
  --lg-edge: rgba(255, 255, 255, 0.9);
  --lg-edge-soft: rgba(255, 255, 255, 0.45);
  --lg-hair: rgba(255, 255, 255, 0.5);
}
html[data-lg-skin='on']:has(body[data-ds-dark-theme]) {
  --lg-edge: rgba(255, 255, 255, 0.26);
  --lg-edge-soft: rgba(255, 255, 255, 0.1);
  --lg-hair: rgba(255, 255, 255, 0.08);
}

/* ---- 对话框 / 弹层 / 卡片 / 输入框：唯一加模糊的一类（叶子表面） ----
   顶部一道镜面高光 + 底部内反光 + 0.5px 棱边，是液态玻璃的签名读法 */
html[data-lg-skin='on'] [${MARK}='dialog'],
html[data-lg-skin='on'] [${MARK}='card'],
html[data-lg-skin='on'] [${MARK}='composer'] {
  -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(180%) brightness(1.04);
  backdrop-filter: blur(var(--lg-blur)) saturate(180%) brightness(1.04);
  box-shadow:
    inset 0 1px 0 var(--lg-edge),
    inset 0 -0.5px 0 var(--lg-edge-soft),
    inset 0 0 0 0.5px var(--lg-hair),
    var(--dsw-elevation-soft);
}
/* 底色各自沿用官方语义 token，只把它调透；层级关系不变 */
html[data-lg-skin='on'] [${MARK}='dialog'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-overlay) 88%, transparent);
}
html[data-lg-skin='on'] [${MARK}='card'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent);
}
html[data-lg-skin='on'] [${MARK}='composer'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 90%, transparent);
}

/* ---- 左侧栏：半透玻璃板（列级容器不开模糊，规避 fixed 包含块副作用） ---- */
html[data-lg-skin='on'] [${MARK}='sidebar'] {
  box-shadow:
    inset 0 1px 0 var(--lg-edge),
    inset -1px 0 0 var(--lg-edge),
    inset 0 0 0 0.5px var(--lg-hair);
}
/* ---- 无障碍：尊重系统"减少透明度" ---- */
@media (prefers-reduced-transparency: reduce) {
  html[data-lg-skin='on'] [${MARK}] {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }
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
		 * 表面识别：稳定契约优先，布局特征兜底
		 * ------------------------------------------------------------------ */

		/** 需要玻璃模糊的宿主容器 → 叶片种类。 */
		const GLASS_HOSTS = [
			['[role="dialog"]', 'dialog'],
			['[data-slot="conversation.composer.bar"]', 'composer'],
			['[data-slot="shell.overlay"]', 'card']
		]

		/**
		 * 槽位标记元素是 `display: contents` 的零尺寸容器，真正上色的是它外面的
		 * 布局元素（官方 CSS 模块类，类名逐版本变化，不可硬编码）。
		 * 从标记向上找"有尺寸且确实画了底色"的祖先——这是布局契约，不依赖类名。
		 * @param marker 起始元素。
		 * @param minHeightShare 祖先至少要占视口高度的比例，避免误标到整窗容器。
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
		 * 从小尺度宿主里找出"圆角矩形面板/卡片"：面板本身、或它的后代，
		 * 条件是圆角 ≥10px、确实画了底色、尺寸收敛。
		 * 只有这类元素才安全地加 backdrop-filter（叶子表面，不带 fixed 后代）。
		 * @param host 宿主容器（对话框、输入区、浮层）。
		 */
		function scanGlassLeaves(host) {
			const out = []
			const vh = window.innerHeight || 1
			// 对话框的 [role=dialog] 可能就是面板本身，所以要把它自己也算作候选
			const candidates = [host, ...host.querySelectorAll('*')]
			for (const el of candidates) {
				// 表单控件/图标不是面板，避免把输入框、按钮糊成玻璃
				if (/^(INPUT|TEXTAREA|BUTTON|SELECT|OPTION|LABEL|A|SVG|PATH|IMG)$/.test(el.tagName)) continue
				if (el.offsetWidth < 180 || el.offsetHeight < 28) continue
				if (el.offsetHeight > vh * 0.7) continue
				const cs = getComputedStyle(el)
				const radius = parseFloat(cs.borderTopLeftRadius) || 0
				if (radius < 10) continue
				if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue
				if (cs.position === 'fixed' && hasFixedDescendant(el)) continue
				out.push(el)
			}
			// 只取最大的那个：嵌套面板重复模糊会糊成一片
			return out.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight).slice(0, 1)
		}

		/** 打标：只写属性，不碰 class、结构与行内样式。 */
		function mark(el, kind) {
			if (!el || el === document.body || el === document.documentElement) return
			if (el.getAttribute(MARK) === kind) return
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
		 * 标记，因此可以随 DOM 变化反复调用（对话框、卡片是后出现的）。
		 */
		function resolveSurfaces() {
			try {
				for (const el of document.querySelectorAll(`[${MARK}]`)) {
					if (!el.isConnected) {
						el.removeAttribute(MARK)
						el.removeAttribute('data-lg-owner')
					}
				}
				// 1) 左侧栏：官方 slot 标记（display:contents 零尺寸）-> 上溯到真正上色的列
				if (document.querySelector(`[${MARK}='sidebar']`) === null) {
					const sideMarker =
						document.querySelector('[data-slot="sidebar"]') ?? document.querySelector('[data-pane="sidebar"]')
					const sideCol = paintedAncestor(sideMarker, 0.5)
					if (sideCol) mark(sideCol, 'sidebar')
				}
				// 2) 玻璃叶片：每轮都补标（对话框面板、输入框卡片、浮层卡片）
				for (const [host, kind] of GLASS_HOSTS) {
					for (const el of document.querySelectorAll(host)) {
						for (const leaf of scanGlassLeaves(el)) mark(leaf, kind)
					}
				}
			} catch (error) {
				console.warn('[dsh-glass-skin] 表面识别失败（皮肤仍以 token 层生效）', error)
			}
		}

		/* ------------------------------------------------------------------ *
		 * 应用/回收：所有副作用都登记在 ctx.effect 里，卸载自动还原
		 * ------------------------------------------------------------------ */

		/**
		 * 把一份偏好应用到页面。
		 * @returns 应用函数，附带 dispose() 用于还原。
		 */
		function createApplier(ctx) {
			const root = document.documentElement
			let tokenDispose = null

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
				if (!on) {
					tokenDispose?.()
					tokenDispose = null
					clearMarks()
					return
				}
				installStyles()
				root.style.setProperty('--lg-blur', `${Number(prefs.blur) || 0}px`)
				applyTokens(prefs)
				resolveSurfaces()
			}

			applier.dispose = () => {
				tokenDispose?.()
				tokenDispose = null
				clearMarks()
				root.removeAttribute(ROOT_FLAG)
				root.style.removeProperty('--lg-blur')
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
		 * 第三方行抛错会波及整页设置，所以失败时退化为一行纯文本。
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
			const label = { flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' }
			const row = (text, control) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 } },
					React.createElement('div', { style: label }, text),
					control
				)
			const toggle = (key, text) => [
				React.createElement('span', { key: 'l', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, text),
				React.createElement(
					'button',
					{
						key: 'b',
						type: 'button',
						'aria-pressed': prefs[key] === true,
						onClick: () => setPref({ [key]: !prefs[key] }),
						style: {
							minWidth: 60,
							height: 26,
							padding: '0 12px',
							borderRadius: 13,
							border: '0.5px solid var(--dsw-alias-border-l2)',
							background: prefs[key] ? 'var(--dsw-alias-state-business-tertiary, rgba(65,118,230,.14))' : 'transparent',
							color: prefs[key] ? 'var(--dsw-alias-state-business-primary, #4176e6)' : 'var(--dsw-alias-label-secondary)',
							cursor: 'pointer'
						}
					},
					prefs[key] ? '开' : '关'
				)
			]
			const slider = (key, min, max, step) =>
				React.createElement('input', {
					type: 'range',
					min,
					max,
					step,
					value: prefs[key],
					'aria-label': key,
					onChange: (e) => setPref({ [key]: Number(e.target.value) }),
					style: { width: 132, accentColor: 'var(--dsw-alias-state-business-primary, #4176e6)' }
				})
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 8px' } },
				row('液态玻璃 · Liquid Glass', React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, toggle('enabled', '圆角面半透'))),
				row('毛玻璃模糊 Blur', slider('blur', 0, 40, 1)),
				row('玻璃不透明度 Opacity', slider('opacity', 0.6, 1.15, 0.05))
			)
		}

		/**
		 * 注册设置行。任何一步失败都只损失"设置界面"，皮肤本身不受影响。
		 *
		 * `inject` 的用法是关键：官方插槽在挂载时回调 `inject(actions)`，
		 * 行组件要拿到新快照必须通过这个 actions 写回 store（ui-theme 同款）。
		 * 直接调 store 对象上的同名方法不会触发重渲染——本插件实测踩过这个坑。
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

			// 表面重扫：React 会替换节点，对话框/卡片是后出现的
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
