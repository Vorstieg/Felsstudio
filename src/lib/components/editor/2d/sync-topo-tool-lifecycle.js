export function syncTopoToolLifecycle({ previousTool, currentTool, drawingTools, clearSelection }) {
	if (previousTool && previousTool !== currentTool) previousTool.onDeactivate?.();
	if (drawingTools.includes(currentTool)) clearSelection();
	currentTool.onActivate?.();
	return currentTool;
}
