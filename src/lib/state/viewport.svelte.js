/**
 * Viewport/media-query store for responsive layout decisions.
 * Exposes derived flags for breakpoints and touch support.
 */

export const viewport = $state({
	/** Raw viewport dimensions */
	width: 0,
	height: 0,
	/** Is the device touch-capable? */
	isTouch: false,
	/** Is the viewport in portrait orientation? */
	isPortrait: false,
	/** Is the viewport in landscape orientation? */
	isLandscape: false,
	/** Breakpoint flags */
	isCompact: false, // < 640 px
	isMedium: false, // 640–1024 px
	isExpanded: false // > 1024 px
});

/**
 * Initialize viewport store and update on resize/orientation change.
 */
export function initViewport() {
	const update = () => {
		const width = window.innerWidth;
		const height = window.innerHeight;
		const isPortrait = height > width;
		const isLandscape = !isPortrait;
		const isTouch =
			'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

		viewport.width = width;
		viewport.height = height;
		viewport.isTouch = isTouch;
		viewport.isPortrait = isPortrait;
		viewport.isLandscape = isLandscape;
		viewport.isCompact = width < 640;
		viewport.isMedium = width >= 640 && width <= 1024;
		viewport.isExpanded = width > 1024;
	};

	// Initial update
	update();

	// Update on resize and orientation change
	window.addEventListener('resize', update);
	window.addEventListener('orientationchange', update);

	// Cleanup
	return () => {
		window.removeEventListener('resize', update);
		window.removeEventListener('orientationchange', update);
	};
}
