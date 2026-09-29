/**
 * dsh-glass-skin —— Host 半。
 *
 * 这一半刻意做到"零依赖、零副作用"：它只提供组合层里的一个可加载入口，
 * 让 `dsh.client` 声明的客户端 bundle 进入浏览器 roster。所有视觉逻辑都在
 * lib/client.js 里（纯浏览器侧），因此 Host 半不会因为缺少 @deepseek-ai/*
 * 运行时包而加载失败——这是"装完不可用"最常见的成因。
 */

export const name = 'dsh-glass-skin'

/** 无行为：皮肤不需要 Host 服务、工具或 HTTP 路由。 */
export function apply() {}
