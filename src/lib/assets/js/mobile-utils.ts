type VibrationType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

type NavigatorWithLegacyTouch = Navigator & {
	msMaxTouchPoints?: number;
};

export function isTouchDevice(): boolean {
	const nav = navigator as NavigatorWithLegacyTouch;
	return (
		'ontouchstart' in window || navigator.maxTouchPoints > 0 || (nav.msMaxTouchPoints ?? 0) > 0
	);
}

export function getTouchTargetSize(baseSize: number): number {
	return isTouchDevice() ? Math.max(baseSize * 2, 12) : baseSize;
}

export function getMapMarkerSize(baseSize = 32): number {
	return isTouchDevice() ? Math.max(baseSize, 44) : baseSize;
}

export function getMapHitRadius(baseRadius = 20): number {
	return isTouchDevice() ? Math.max(baseRadius, 36) : baseRadius;
}

export function getHitAreaSize(baseSize: number): number {
	return isTouchDevice() ? Math.max(baseSize * 2, 18) : baseSize;
}

export function vibrateOnAction(type: VibrationType = 'light'): void {
	if (!navigator.vibrate) return;

	const patterns: Record<VibrationType, VibratePattern> = {
		light: 10,
		medium: 20,
		heavy: 30,
		selection: 5,
		success: [10, 50, 10],
		warning: [20, 100, 20],
		error: [50, 100, 50]
	};

	navigator.vibrate(patterns[type]);
}

export function isMobileViewport(): boolean {
	return window.innerWidth < 768;
}
