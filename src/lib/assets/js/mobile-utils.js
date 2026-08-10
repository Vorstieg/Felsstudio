/**
 * Mobile utility functions for touch detection and interaction helpers
 */

/**
 * Detect if the device supports touch events
 * @returns {boolean} True if touch is supported
 */
export function isTouchDevice() {
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

/**
 * Get appropriate touch target size based on device type
 * @param {number} baseSize - Base size for non-touch devices
 * @returns {number} Adjusted size for touch devices
 */
export function getTouchTargetSize(baseSize) {
	return isTouchDevice() ? Math.max(baseSize * 2, 12) : baseSize;
}

/**
 * Map marker/icon size that remains finger-draggable on touch screens.
 * @param {number} baseSize
 * @returns {number}
 */
export function getMapMarkerSize(baseSize = 32) {
	return isTouchDevice() ? Math.max(baseSize, 44) : baseSize;
}

/**
 * Pixel query radius for touch hit testing map features.
 * @param {number} baseRadius
 * @returns {number}
 */
export function getMapHitRadius(baseRadius = 20) {
	return isTouchDevice() ? Math.max(baseRadius, 36) : baseRadius;
}

/**
 * Get appropriate hit area size for routes/paths
 * @param {number} baseSize - Base size for non-touch devices
 * @returns {number} Adjusted size for touch devices
 */
export function getHitAreaSize(baseSize) {
	return isTouchDevice() ? Math.max(baseSize * 2, 18) : baseSize;
}

/**
 * Trigger haptic feedback if available (mobile devices)
 * @param {string} type - 'light', 'medium', 'heavy', 'selection', 'success', 'warning', 'error'
 */
export function vibrateOnAction(type = 'light') {
	if (!navigator.vibrate) return;

	const patterns = {
		light: 10,
		medium: 20,
		heavy: 30,
		selection: 5,
		success: [10, 50, 10],
		warning: [20, 100, 20],
		error: [50, 100, 50]
	};

	const pattern = patterns[type] || patterns.light;
	navigator.vibrate(pattern);
}

/**
 * Check if the viewport is mobile-sized
 * @returns {boolean} True if viewport width is less than 768px
 */
export function isMobileViewport() {
	return window.innerWidth < 768;
}
