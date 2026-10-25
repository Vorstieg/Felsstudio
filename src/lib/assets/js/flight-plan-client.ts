import type { Polygon } from 'geojson';
import { checkFlightWork, FLIGHT_LIMITS } from './flight-plan-limits.ts';
import type { FlightPlan } from './flight-plan-types.ts';
import type { FlightPlanRequestOptions } from './flight-plan-job.ts';

export function generateFlightPlanInWorker(
	geometry: Polygon,
	options: FlightPlanRequestOptions,
	{
		signal,
		onProgress = () => {}
	}: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}
): Promise<FlightPlan> {
	return new Promise((resolve, reject) => {
		checkFlightWork(
			geometry.coordinates[0].length,
			FLIGHT_LIMITS.polygonVertices,
			'Polygon vertices'
		);
		if (signal?.aborted) {
			reject(new DOMException('Flight generation cancelled.', 'AbortError'));
			return;
		}
		const worker = new Worker(new URL('./flight-plan.worker.ts', import.meta.url), {
			type: 'module'
		});
		let settled = false;
		const finish = (error?: Error, plan?: FlightPlan) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			worker.terminate();
			if (error) reject(error);
			else resolve(plan!);
		};
		const abort = () => finish(new DOMException('Flight generation cancelled.', 'AbortError'));
		const timer = setTimeout(
			() =>
				finish(
					new Error('Flight generation took too long. Reduce the capture area or increase spacing.')
				),
			120000
		);
		signal?.addEventListener('abort', abort, { once: true });
		worker.onmessage = ({ data }) => {
			if (settled) return;
			if (data.type === 'progress') onProgress(data.message);
			else if (data.type === 'complete') finish(undefined, data.plan);
			else if (data.type === 'error') finish(new Error(data.message));
		};
		worker.onerror = () =>
			finish(new Error('Background flight generation failed. Please try again.'));
		worker.onmessageerror = () =>
			finish(new Error('The background flight calculation returned an unreadable result.'));
		try {
			worker.postMessage({ geometry, options });
		} catch (error) {
			finish(error instanceof Error ? error : new Error('Unable to start flight generation.'));
		}
	});
}
