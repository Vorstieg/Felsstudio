import { vibrateOnAction } from '$lib/assets/js/mobile-utils.ts';

type VibrationType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export type ToolInteractionTool = {
	id: string;
	disabled?: boolean;
	hasOptions?: boolean;
	openOptionsOnSelect?: boolean;
	onSelect?: (context: { tool: ToolInteractionTool; isActive: boolean }) => void;
};

export type ToolInteractionAction = {
	disabled?: boolean;
	keepActive?: boolean;
	run?: () => void;
};

type ToolInteractionOptions = {
	getActiveTool: () => string;
	setActiveTool: (toolId: string | undefined) => void;
	setOptionsOpen: (open: boolean) => void;
	shouldOpenOptionsOnSelect?: (tool: ToolInteractionTool) => boolean;
	neutralTool?: string;
	getNeutralTool?: () => string | undefined;
};

type RunActionOptions = {
	finish?: ToolInteractionAction | null;
	cancel?: ToolInteractionAction | null;
	vibration?: VibrationType;
};

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
}: ToolInteractionOptions) {
	const resolveNeutralTool = () => getNeutralTool();

	function selectTool(tool: ToolInteractionTool): void {
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

	function runAction(
		action: ToolInteractionAction | null | undefined,
		{ finish = null, cancel = null, vibration = 'light' }: RunActionOptions = {}
	): void {
		if (!action || action.disabled) return;
		vibrateOnAction(vibration);
		action.run?.();
		if ((action === finish || action === cancel) && !action.keepActive) {
			setActiveTool(resolveNeutralTool());
		}
	}

	return { selectTool, runAction };
}
