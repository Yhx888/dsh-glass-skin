/**
 * dsh-glass-skin —— Client 半（浏览器侧皮肤）。
 *
 * 目标：把界面里的**圆角矩形表面**做成苹果 Liquid Glass 观感，**页面背景一律不动**。
 *
 * 液态玻璃 ≠ 毛玻璃。真正的差别在"棱边折射（lensing）"：
 *   1. 折射：按斯涅尔定律算出一条"位移贴图"（R=Δx，G=Δy，128 为中性），
 *      用 <feImage> + <feDisplacementMap> 做成 SVG 滤镜，再通过
 *      `backdrop-filter: url(#…)` 施加到元素上——棱边附近背后内容被透镜般挤压，
 *      这是"液态"的来源。Chromium 专属能力，而桌面端正是 Electron/Chromium。
 *   2. 镜面棱边：用 mask-composite 挖出一个 1.5px 环，做方向性高光（左上亮、右下弱）。
 *   3. 顶光 + 指针跟随镜面：另一层伪元素，radial 高光随指针移动。
 *
 * 三层都只作用在被标记的圆角表面上；背景（html/body/--dsw-alias-bg-base）不碰。
 * 任何一层失败都自动降级（拿不到折射就退回纯 blur），绝不把界面搞坏。
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
		/** 皮肤总开关属性。 */
		const ROOT_FLAG = 'data-lg-skin'
		/** 偏好存储键（浏览器本地）。 */
		const PREF_KEY = 'dsh-glass-skin/prefs'
		/** 本插件生成的 SVG 滤镜 id 前缀。 */
		const FILTER_PREFIX = 'lg-refract-'

		/** 默认偏好。 */
		const DEFAULTS = {
			enabled: true, // 总开关
			refract: true, // 棱边折射（Liquid Glass 的核心）
			strength: 1.5, // 折射强度倍率 0.4~3
			blur: 6, // 附加毛玻璃模糊（折射之外的柔化）
			opacity: 1 // 表面不透明度系数 0.6~1.15
		}

		/** 棱边（bezel）宽度基准：折射带有多宽，随元素短边自适应。 */
		const BEZEL_RATIO = 0.07
		const BEZEL_MIN = 10
		const BEZEL_MAX = 24

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
				/* 隐私模式等场景静默降级 */
			}
		}

		/* ------------------------------------------------------------------ *
		 * 颜色层：官方 token 覆盖（只动"面"，不动"底"与文字）
		 * ------------------------------------------------------------------ */

		/** 官方深色表面基色（neutral-bluish 系）。 */
		const DARK_SURFACE = '22, 26, 35'

		/**
		 * 由偏好推导官方别名 token 的明暗两套取值。
		 * 刻意不含 --dsw-alias-bg-base / label / brand / state：背景与文字保持官方外观。
		 * @param prefs 当前偏好。
		 */
		function buildTokens(prefs) {
			const k = Math.min(1.15, Math.max(0.5, Number(prefs.opacity) || 1))
			const w = (a) => `rgba(255, 255, 255, ${+(a * k).toFixed(3)})`
			const d = (a) => `rgba(${DARK_SURFACE}, ${+(a * k).toFixed(3)})`
			return {
				'--dsw-alias-bg-layer-1': { light: w(0.52), dark: d(0.5) },
				'--dsw-alias-bg-layer-2': { light: w(0.6), dark: d(0.58) },
				'--dsw-alias-bg-overlay': { light: w(0.66), dark: d(0.68) },
				'--dsw-alias-border-l1': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' },
				'--dsw-alias-border-l2': { light: 'rgba(15, 23, 42, 0.1)', dark: 'rgba(255, 255, 255, 0.15)' },
				'--dsw-specific-sidebar-fill': { light: w(0.62), dark: d(0.64) }
			}
		}

		/* ------------------------------------------------------------------ *
		 * 样式表
		 * ------------------------------------------------------------------ */

		const SKIN_CSS = `
/* ============ dsh-glass-skin：圆角面 = 液态玻璃（背景不动） ============ */

html[data-lg-skin='on'] {
  --lg-edge: rgba(255, 255, 255, 0.92);
  --lg-edge-soft: rgba(255, 255, 255, 0.42);
  --lg-hair: rgba(255, 255, 255, 0.5);
  --lg-rim-hi: rgba(255, 255, 255, 0.95);
  --lg-rim-lo: rgba(255, 255, 255, 0.34);
  --lg-gloss: rgba(255, 255, 255, 0.3);
  --lg-sheen-a: 0;
}
html[data-lg-skin='on']:has(body[data-ds-dark-theme]) {
  --lg-edge: rgba(255, 255, 255, 0.28);
  --lg-edge-soft: rgba(255, 255, 255, 0.1);
  --lg-hair: rgba(255, 255, 255, 0.09);
  --lg-rim-hi: rgba(255, 255, 255, 0.5);
  --lg-rim-lo: rgba(255, 255, 255, 0.12);
  --lg-gloss: rgba(255, 255, 255, 0.14);
}

/* ---- 玻璃主体：折射滤镜 + 柔化 + 提饱和（Chromium 支持 url() 形式的 backdrop-filter） ---- */
html[data-lg-skin='on'] [${MARK}='dialog'][data-lg-refract='on'],
html[data-lg-skin='on'] [${MARK}='card'][data-lg-refract='on'],
html[data-lg-skin='on'] [${MARK}='composer'][data-lg-refract='on'] {
  /* 先柔化、再折射：棱边因此保持"透镜环"的结构，而不是糊成一团 */
  -webkit-backdrop-filter: blur(var(--lg-blur)) var(--lg-filter) saturate(180%) brightness(1.04);
  backdrop-filter: blur(var(--lg-blur)) var(--lg-filter) saturate(180%) brightness(1.04);
}
/* 拿不到折射时的降级：纯毛玻璃 */
html[data-lg-skin='on'] [${MARK}='dialog'][data-lg-refract='off'],
html[data-lg-skin='on'] [${MARK}='card'][data-lg-refract='off'],
html[data-lg-skin='on'] [${MARK}='composer'][data-lg-refract='off'] {
  -webkit-backdrop-filter: blur(calc(var(--lg-blur) + 14px)) saturate(180%) brightness(1.04);
  backdrop-filter: blur(calc(var(--lg-blur) + 14px)) saturate(180%) brightness(1.04);
}

/* 底色沿用官方语义 token，只调透；层级关系不变 */
html[data-lg-skin='on'] [${MARK}='dialog'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-overlay) 84%, transparent);
}
html[data-lg-skin='on'] [${MARK}='card'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 86%, transparent);
}
html[data-lg-skin='on'] [${MARK}='composer'] {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 88%, transparent);
}

/* ---- 镜面棱边：2px 环 + 方向性高光（左上最亮、右下次亮） ---- */
html[data-lg-skin='on'] [data-lg-rim='1']::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  pointer-events: none;
  background: linear-gradient(
    133deg,
    var(--lg-rim-hi) 0%,
    rgba(255, 255, 255, 0.3) 20%,
    rgba(255, 255, 255, 0.05) 44%,
    var(--lg-rim-lo) 72%,
    var(--lg-rim-hi) 100%
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  z-index: 1;
}
/* 玻璃厚度感：棱边内侧压一道极淡的暗线 + 底部内阴影 */
html[data-lg-skin='on'] [${MARK}='dialog'],
html[data-lg-skin='on'] [${MARK}='card'],
html[data-lg-skin='on'] [${MARK}='composer'] {
  box-shadow:
    inset 0 1px 0 var(--lg-edge),
    inset 0 -1px 0 var(--lg-edge-soft),
    inset 0 -14px 22px -18px rgba(15, 23, 42, 0.35),
    inset 0 0 0 0.5px var(--lg-hair),
    var(--dsw-elevation-soft);
}

/* ---- 顶光 + 指针跟随的镜面光斑 ---- */
html[data-lg-skin='on'] [data-lg-gloss='1']::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    radial-gradient(150% 96% at 50% -34%, var(--lg-gloss), transparent 58%),
    radial-gradient(
      230px circle at var(--lg-mx, 50%) var(--lg-my, 50%),
      rgba(255, 255, 255, var(--lg-sheen-a, 0)),
      transparent 62%
    );
  transition: opacity 0.22s ease;
  z-index: 2;
}

/* ---- 左侧栏：列级容器不开模糊（规避 fixed 包含块副作用），只做玻璃板棱边 ---- */
html[data-lg-skin='on'] [${MARK}='sidebar'] {
  box-shadow:
    inset 0 1px 0 var(--lg-edge),
    inset -1px 0 0 var(--lg-edge),
    inset 0 0 0 0.5px var(--lg-hair);
}
html[data-lg-skin='on'] [${MARK}='sidebar'][data-lg-rim='1']::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(160deg, var(--lg-rim-hi) 0%, rgba(255, 255, 255, 0.06) 18%, rgba(255, 255, 255, 0) 60%);
  opacity: 0.5;
  z-index: 1;
}

/* ---- 无障碍：系统要求减少透明度时全部退化为官方外观 ---- */
@media (prefers-reduced-transparency: reduce) {
  html[data-lg-skin='on'] [${MARK}] {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }
  html[data-lg-skin='on'] [data-lg-rim='1']::before,
  html[data-lg-skin='on'] [data-lg-gloss='1']::after {
    display: none;
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
		 * 折射：位移贴图 + SVG 滤镜
		 * ------------------------------------------------------------------ */

		/** 本机是否支持把 SVG 滤镜当 backdrop-filter 用（Chromium 专属）。 */
		function supportsFilterBackdrop() {
			try {
				return CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)')
			} catch {
				return false
			}
		}

		/** 苹果偏爱的凸圆角截面：外缘 0 → 棱边内侧 1。 */
		function squircle(t) {
			return Math.pow(1 - Math.pow(1 - t, 4), 0.25)
		}

		/**
		 * 生成位移贴图（data URL）。
		 *
		 * 每个像素编码「该点应向哪个方向、移动多少像素去采样背景」：
		 *   R = 128 + Δx/maxDisp·127，G = 128 + Δy/maxDisp·127（128 为不动）。
		 * 只在圆角矩形的棱边带内有值，位移方向指向内侧（凸面折射，光线留在玻璃内），
		 * 外缘最强、到棱边内侧归零——这正是透镜边缘把背景"挤压"进棱边的效果。
		 *
		 * @param w 元素宽（CSS px）。
		 * @param h 元素高（CSS px）。
		 * @param radius 圆角半径（CSS px）。
		 * @param bezel 棱边带宽度（CSS px）。
		 * @param maxDisp 最大位移量（CSS px）。
		 * @param down 贴图降采样倍数（贴图会被拉伸回元素尺寸）。
		 * @returns PNG data URL，失败时 null。
		 */
		function buildDisplacementMap(w, h, radius, bezel, maxDisp, down) {
			const W = Math.max(2, Math.round(w / down))
			const H = Math.max(2, Math.round(h / down))
			const canvas = document.createElement('canvas')
			canvas.width = W
			canvas.height = H
			const ctx = canvas.getContext('2d')
			if (ctx === null) return null
			const img = ctx.createImageData(W, H)
			const data = img.data
			const r = Math.max(0, Math.min(radius / down, Math.min(W, H) / 2))
			const b = Math.max(2, bezel / down)
			const halfW = W / 2
			const halfH = H / 2
			for (let y = 0; y < H; y += 1) {
				const py = y + 0.5 - halfH
				for (let x = 0; x < W; x += 1) {
					const i = (y * W + x) * 4
					const px = x + 0.5 - halfW
					// 圆角矩形 SDF：qx/qy 为到"内核实心矩形"的有符号距离
					const qx = Math.abs(px) - (halfW - r)
					const qy = Math.abs(py) - (halfH - r)
					const ax = Math.max(qx, 0)
					const ay = Math.max(qy, 0)
					const outside = Math.hypot(ax, ay)
					const sdf = outside + Math.min(Math.max(qx, qy), 0) - r
					const dist = -sdf // >0 在内部，0 在边界
					// 外法线方向 = 圆角矩形 SDF 的梯度：
					// 圆角区按 max(q,0) 归一化，再逐分量带上 px/py 的符号（少了符号就会反向）
					let nx = 0
					let ny = 0
					if (outside > 1e-4) {
						nx = qx > 0 ? (px >= 0 ? ax / outside : -ax / outside) : 0
						ny = qy > 0 ? (py >= 0 ? ay / outside : -ay / outside) : 0
					} else if (qx > qy) {
						nx = px >= 0 ? 1 : -1
					} else {
						ny = py >= 0 ? 1 : -1
					}
					let dr = 128
					let dg = 128
					if (dist > 0 && dist < b) {
						const t = 1 - dist / b // 0 外缘 → 1 棱边内侧
						const s = squircle(t)
						// 外缘最强、内侧归零；前 1.5px 软起边，避免硬切
						const mag = (1 - s) * maxDisp * Math.min(1, dist / 1.5)
						const dx = -nx * mag // 指向内侧
						const dy = -ny * mag
						dr = 128 + (dx / maxDisp) * 127
						dg = 128 + (dy / maxDisp) * 127
					}
					data[i] = dr < 0 ? 0 : dr > 255 ? 255 : dr
					data[i + 1] = dg < 0 ? 0 : dg > 255 ? 255 : dg
					data[i + 2] = 128
					data[i + 3] = 255
				}
			}
			ctx.putImageData(img, 0, 0)
			try {
				return canvas.toDataURL('image/png')
			} catch {
				return null
			}
		}

		/** 本插件创建的滤镜容器。 */
		let filterHost = null
		/** 已生成的滤镜：元素 → { id, svg, url }。 */
		const filters = new WeakMap()
		let filterSeq = 0

		function ensureFilterHost() {
			if (filterHost !== null && filterHost.isConnected) return filterHost
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
			svg.setAttribute('width', '0')
			svg.setAttribute('height', '0')
			svg.setAttribute('aria-hidden', 'true')
			svg.dataset.plugin = PLUGIN_ID
			svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
			document.body.appendChild(svg)
			filterHost = svg
			return svg
		}

		/**
		 * 为一个元素生成/刷新折射滤镜。
		 * @returns 滤镜 url（形如 `url(#lg-refract-3)`），生成失败返回 null。
		 */
		function applyRefraction(el, prefs) {
			const w = el.offsetWidth
			const h = el.offsetHeight
			if (w < 40 || h < 24) return null
			const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
			const bezel = Math.max(BEZEL_MIN, Math.min(BEZEL_MAX, Math.min(w, h) * BEZEL_RATIO))
			const maxDisp = bezel * 0.18 * (Number(prefs.strength) || 1)
			const signature = `${w}x${h}|${Math.round(maxDisp * 10)}|${Math.round(bezel)}`

			// 缓存命中就直接返回：尺寸/强度没变时绝不重算贴图（重扫很频繁）
			const cached = filters.get(el)
			if (cached !== undefined && cached.signature === signature) return `url(#${cached.id})`

			const down = w * h > 260000 ? 3 : 2 // 大面板降采样，控制生成耗时
			const dataUrl = buildDisplacementMap(w, h, radius, bezel, maxDisp, down)
			if (dataUrl === null) return null

			const host = ensureFilterHost()
			let entry = cached
			if (entry === undefined) {
				filterSeq += 1
				const id = `${FILTER_PREFIX}${filterSeq}`
				const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
				filter.setAttribute('id', id)
				// 滤镜区域就是元素本身；不动 x/y/width/height（默认 objectBoundingBox 0 0 1 1）
				filter.setAttribute('color-interpolation-filters', 'sRGB')
				const image = document.createElementNS('http://www.w3.org/2000/svg', 'feImage')
				image.setAttribute('result', 'map')
				image.setAttribute('x', '0')
				image.setAttribute('y', '0')
				image.setAttribute('preserveAspectRatio', 'none')
				const disp = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap')
				disp.setAttribute('in', 'SourceGraphic')
				disp.setAttribute('in2', 'map')
				disp.setAttribute('xChannelSelector', 'R')
				disp.setAttribute('yChannelSelector', 'G')
				filter.appendChild(image)
				filter.appendChild(disp)
				host.appendChild(filter)
				entry = { id, filter, image, disp, signature: '' }
				filters.set(el, entry)
			}
			entry.image.setAttribute('href', dataUrl)
			entry.image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl)
			entry.image.setAttribute('width', String(w))
			entry.image.setAttribute('height', String(h))
			entry.disp.setAttribute('scale', String(maxDisp))
			entry.signature = signature
			return `url(#${entry.id})`
		}

		/** 移除一个元素的折射滤镜（连 <filter> 一起摘掉，避免反复开关时残留）。 */
		function dropRefraction(el) {
			const entry = filters.get(el)
			if (entry === undefined) return
			entry.filter.remove()
			el.style.removeProperty('--lg-filter')
			filters.delete(el)
		}

		/* ------------------------------------------------------------------ *
		 * 表面识别
		 * ------------------------------------------------------------------ */

		/** 需要玻璃处理的宿主容器 → 叶片种类。 */
		const GLASS_HOSTS = [
			['[role="dialog"]', 'dialog'],
			['[data-slot="conversation.composer.bar"]', 'composer'],
			['[data-slot="shell.overlay"]', 'card']
		]

		/** 槽位标记是 display:contents 的零尺寸容器，向上找真正上色的祖先。 */
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

		/** fixed 元素给 backdrop-filter 会改包含块，先确认它内部没有 fixed 后代。 */
		function hasFixedDescendant(el) {
			let checked = 0
			for (const node of el.querySelectorAll('*')) {
				if (++checked > 400) return false
				if (getComputedStyle(node).position === 'fixed') return true
			}
			return false
		}

		/** 在小尺度宿主里找"圆角矩形面板"：宿主自身或其最大后代。 */
		function scanGlassLeaves(host) {
			const out = []
			const vh = window.innerHeight || 1
			for (const el of [host, ...host.querySelectorAll('*')]) {
				if (/^(INPUT|TEXTAREA|BUTTON|SELECT|OPTION|LABEL|A|SVG|PATH|IMG)$/.test(el.tagName)) continue
				if (el.offsetWidth < 180 || el.offsetHeight < 28) continue
				if (el.offsetHeight > vh * 0.7) continue
				const cs = getComputedStyle(el)
				if ((parseFloat(cs.borderTopLeftRadius) || 0) < 10) continue
				if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue
				if (cs.position === 'fixed' && hasFixedDescendant(el)) continue
				out.push(el)
			}
			return out.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight).slice(0, 1)
		}

		/**
		 * 伪元素是否可用：官方元素可能已经用了 ::before / ::after，
		 * 只有空着才敢借用（用 `content` 计算值判断）。
		 */
		function pseudoFree(el, pseudo) {
			try {
				const cs = getComputedStyle(el, pseudo)
				return cs.content === 'none' || cs.content === 'normal' || cs.content === ''
			} catch {
				return false
			}
		}

		/** 打标：只写属性，不碰 class、结构与行内样式。 */
		function mark(el, kind) {
			if (!el || el === document.body || el === document.documentElement) return
			if (el.getAttribute(MARK) === kind) return
			el.setAttribute(MARK, kind)
			el.setAttribute('data-lg-owner', PLUGIN_ID)
		}

		/** 标记可用层次：不动 layout 才敢借伪元素（position 不能是 static）。 */
		function decorate(el) {
			try {
				const positioned = getComputedStyle(el).position !== 'static'
				if (positioned && pseudoFree(el, '::before')) el.setAttribute('data-lg-rim', '1')
				if (positioned && pseudoFree(el, '::after')) el.setAttribute('data-lg-gloss', '1')
			} catch {
				/* 探测失败就不加装饰层 */
			}
		}

		/** 清掉本插件打过的全部标记（含滤镜与行内变量）。 */
		function clearMarks() {
			for (const el of document.querySelectorAll(`[data-lg-owner="${PLUGIN_ID}"]`)) {
				dropRefraction(el)
				el.removeAttribute(MARK)
				el.removeAttribute('data-lg-owner')
				el.removeAttribute('data-lg-rim')
				el.removeAttribute('data-lg-gloss')
				el.removeAttribute('data-lg-refract')
			}
		}

		/**
		 * 解析并标记玻璃表面，并为叶子表面生成折射滤镜。
		 * 增量式：可随 DOM 变化反复调用。
		 */
		function resolveSurfaces(prefs) {
			try {
				for (const el of document.querySelectorAll(`[${MARK}]`)) {
					if (!el.isConnected) {
						dropRefraction(el)
						el.removeAttribute(MARK)
						el.removeAttribute('data-lg-owner')
					}
				}
				// 1) 左侧栏：官方 slot 标记（display:contents）-> 上溯到真正上色的列
				if (document.querySelector(`[${MARK}='sidebar']`) === null) {
					const marker =
						document.querySelector('[data-slot="sidebar"]') ?? document.querySelector('[data-pane="sidebar"]')
					const col = paintedAncestor(marker, 0.5)
					if (col) {
						mark(col, 'sidebar')
						decorate(col)
					}
				}
				// 2) 玻璃叶片：对话框面板、输入框卡片、浮层卡片
				const canRefract = supportsFilterBackdrop() && prefs.refract === true
				for (const [host, kind] of GLASS_HOSTS) {
					for (const container of document.querySelectorAll(host)) {
						for (const leaf of scanGlassLeaves(container)) {
							mark(leaf, kind)
							decorate(leaf)
							if (!canRefract) {
								leaf.setAttribute('data-lg-refract', 'off')
								continue
							}
							const url = applyRefraction(leaf, prefs)
							if (url === null) {
								leaf.setAttribute('data-lg-refract', 'off')
								continue
							}
							leaf.style.setProperty('--lg-filter', url)
							leaf.setAttribute('data-lg-refract', 'on')
						}
					}
				}
			} catch (error) {
				console.warn('[dsh-glass-skin] 表面识别失败（皮肤仍以 token 层生效）', error)
			}
		}

		/* ------------------------------------------------------------------ *
		 * 指针镜面：只更新被指到的玻璃面自己的变量
		 * ------------------------------------------------------------------ */

		function installPointerSpecular() {
			const onMove = (event) => {
				const target = event.target
				if (!(target instanceof Element)) return
				const surface = target.closest(`[data-lg-gloss='1']`)
				if (surface === null) return
				const rect = surface.getBoundingClientRect()
				if (rect.width === 0 || rect.height === 0) return
				surface.style.setProperty('--lg-mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`)
				surface.style.setProperty('--lg-my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`)
				surface.style.setProperty('--lg-sheen-a', '0.22')
			}
			const onOut = (event) => {
				const target = event.target
				if (!(target instanceof Element)) return
				const surface = target.closest(`[data-lg-gloss='1']`)
				if (surface === null) return
				if (surface.contains(event.relatedTarget)) return
				surface.style.setProperty('--lg-sheen-a', '0')
			}
			document.addEventListener('pointermove', onMove, { passive: true })
			document.addEventListener('pointerout', onOut, { passive: true })
			return () => {
				document.removeEventListener('pointermove', onMove)
				document.removeEventListener('pointerout', onOut)
			}
		}

		/* ------------------------------------------------------------------ *
		 * 应用/回收
		 * ------------------------------------------------------------------ */

		function createApplier(ctx) {
			const root = document.documentElement
			let tokenDispose = null

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
				try {
					tokenDispose?.()
					tokenDispose = ctx.theme.overrideTokens(PLUGIN_ID, buildTokens(prefs))
				} catch (error) {
					console.warn('[dsh-glass-skin] token 覆盖层注册失败', error)
				}
				resolveSurfaces(prefs)
			}

			applier.dispose = () => {
				tokenDispose?.()
				tokenDispose = null
				clearMarks()
				filterHost?.remove()
				filterHost = null
				root.removeAttribute(ROOT_FLAG)
				root.style.removeProperty('--lg-blur')
				document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`)?.remove()
			}
			return applier
		}

		/* ------------------------------------------------------------------ *
		 * 设置行（官方 settings.general.item 插槽）
		 * ------------------------------------------------------------------ */

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

		/** 设置行组件：整段 try/catch，失败也绝不影响官方设置页。 */
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
			const labelStyle = { flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' }
			const row = (text, control) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 } },
					React.createElement('div', { style: labelStyle }, text),
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
			const slider = (key, min, max, step) =>
				React.createElement('input', {
					type: 'range',
					min,
					max,
					step,
					value: prefs[key],
					'aria-label': key,
					onChange: (e) => setPref({ [key]: Number(e.target.value) }),
					style: { width: 128, accentColor: 'var(--dsw-alias-state-business-primary, #4176e6)' }
				})
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 8px' } },
				row('液态玻璃 · Liquid Glass', toggle('enabled')),
				row('棱边折射 Refraction', toggle('refract')),
				row('折射强度 Strength', slider('strength', 0.4, 3, 0.1)),
				row('毛玻璃模糊 Blur', slider('blur', 0, 16, 1)),
				row('玻璃不透明度 Opacity', slider('opacity', 0.6, 1.15, 0.05))
			)
		}

		/**
		 * 注册设置行。`inject(actions)` 是官方约定的回填通道——
		 * 直接调 store 对象上的同名方法不会触发重渲染（实测踩过的坑）。
		 */
		function registerSettingsRow(ctx, store, injected) {
			try {
				ctx.slots.inject('settings.general.item', () =>
					ctx.slots.register(
						{ name: 'settings.general.item', id: 'liquid-glass', order: 30, store, inject: injected },
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
			let bound = null
			const store = createStore(prefs)

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

			const injected = (actions) => {
				bound = actions
				try {
					bound.sync(prefs)
				} catch (error) {
					console.warn('[dsh-glass-skin] 初始偏好回填失败', error)
				}
				return { setPref }
			}

			ctx.effect(() => {
				applier(prefs)
				return () => applier.dispose()
			}, 'glass-skin: 应用与还原')

			// DOM 变化：对话框、卡片是后出现的；尺寸变化要重建位移贴图
			ctx.effect(() => {
				let timer = null
				const schedule = () => {
					if (timer !== null) return
					timer = setTimeout(() => {
						timer = null
						if (prefs.enabled) resolveSurfaces(prefs)
					}, 350)
				}
				const observer = new MutationObserver(schedule)
				observer.observe(document.body, { childList: true, subtree: true })
				const resizeObserver = new ResizeObserver(schedule)
				resizeObserver.observe(document.documentElement)
				window.addEventListener('resize', schedule)
				return () => {
					observer.disconnect()
					resizeObserver.disconnect()
					window.removeEventListener('resize', schedule)
					if (timer !== null) clearTimeout(timer)
				}
			}, 'glass-skin: 表面重扫')

			ctx.effect(() => installPointerSpecular(), 'glass-skin: 指针镜面')

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
