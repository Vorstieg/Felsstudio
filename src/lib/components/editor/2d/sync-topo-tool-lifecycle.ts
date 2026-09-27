type LifecycleTool = {
	onActivate?: () => unknown;
	onDeactivate?: () => unknown;
};

type SyncTopoToolLifecycleOptions<T extends LifecycleTool> = {
	previousTool?: T | null;
	currentTool: T;
	drawingTools: readonly T[];
	clearSelection: () => void;
};

export function syncTopoToolLifecycle<T extends LifecycleTool>({
	previousTool,
	currentTool,
	drawingTools,
	clearSelection
}: SyncTopoToolLifecycleOptions<T>): T {
	if (previousTool && previousTool !== currentTool) previousTool.onDeactivate?.();
	if (drawingTools.includes(currentTool)) clearSelection();
	currentTool.onActivate?.();
	return currentTool;
}
