import type {
	ProcessingControls,
	ProcessingOptions,
	ProcessingStep,
	ReconstructionEngine
} from '$lib/api/processing';

export const processingSteps: ProcessingStep[] = [
	'preparing',
	'reconstructing',
	'detecting',
	'positioning'
];

/** Send overrides only for steps being executed. Explicit null clears inherited engine overrides. */
export function processingOptionsForRun(
	controls: ProcessingControls,
	edits: ProcessingOptions,
	source: ProcessingOptions = {},
	fromStep: ProcessingStep = 'preparing',
	engine: ReconstructionEngine
): ProcessingOptions {
	const result: ProcessingOptions = {};
	for (const step of processingSteps.slice(processingSteps.indexOf(fromStep))) {
		const fields = { ...edits[step] };
		for (const [key, control] of Object.entries(controls[step])) {
			if (control.engines && !control.engines.includes(engine)) {
				delete fields[key];
				if (source[step]?.[key] != null) fields[key] = null;
			}
		}
		if (Object.keys(fields).length) result[step] = fields;
	}
	return result;
}
