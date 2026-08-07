/**
 * Adapts editor tools to the capability-only interface consumed by D3 layers.
 * Renderers receive these plain services, never tool class instances.
 */
export function createTopoRenderEditServices({ route, outline, symbol } = {}) {
	return {
		route: {
			id: route?.id,
			handleRouteDown: (...args) => route?.handleRouteDown?.(...args),
			handleTouchRouteDown: (...args) => route?.handleTouchRouteDown?.(...args),
			render: (context) => route?.render?.(context)
		},
		outline: {
			id: outline?.id,
			handleOutlineDown: (...args) => outline?.handleOutlineDown?.(...args),
			handleTouchOutlineDown: (...args) => outline?.handleTouchOutlineDown?.(...args),
			render: (context) => outline?.render?.(context)
		},
		symbol: {
			id: symbol?.id,
			handlePointerDown: (...args) => symbol?.handlePointerDown?.(...args),
			handleTouchStart: (...args) => symbol?.handleTouchStart?.(...args),
			render: (context) => symbol?.render?.(context)
		}
	};
}
