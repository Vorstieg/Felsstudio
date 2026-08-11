import { vibrateOnAction } from '$lib/assets/js/mobile-utils.js';

/**
 * Shared toolbar interaction policy for all editors.
 * Editor-specific state stays in the parent; this module only owns transitions.
 */
export function createToolInteraction({
	getActiveTool,
	setActiveTool,
	setOptionsOpen,
	shouldOpenOptionsOnSelect = () => false,
	neutralTool,
	getNeutralTool = () => neutralTool
}) {
	const resolveNeutralTool = () => getNeutralTool();

	function selectTool(tool) {
		if (tool.disabled) return;
		vibrateOnAction('selection');

		const isActive = getActiveTool() === tool.id;
		if (tool.id === resolveNeutralTool()) {
			setActiveTool(resolveNeutralTool());
			setOptionsOpen(Boolean(tool.hasOptions && shouldOpenOptionsOnSelect(tool)));
			return;
		}

		tool.onSelect?.({ tool, isActive });
		if (!isActive) {
			setActiveTool(tool.id);
			setOptionsOpen(Boolean(tool.hasOptions && shouldOpenOptionsOnSelect(tool)));
		} else if (tool.hasOptions) {
			setOptionsOpen(true);
		}
	}

	function runAction(action, { finish = null, cancel = null, vibration = 'light' } = {}) {
		if (!action || action.disabled) return;
		vibrateOnAction(vibration);
		action.run?.();
		if ((action === finish || action === cancel) && !action.keepActive) {
			setActiveTool(resolveNeutralTool());
		}
	}

	return { selectTool, runAction };
}
