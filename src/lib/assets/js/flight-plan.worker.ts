import { runFlightPlanJob, type FlightPlanRequestOptions } from './flight-plan-job.ts';
import type { Polygon } from 'geojson';

self.onmessage = async (
	event: MessageEvent<{ geometry: Polygon; options: FlightPlanRequestOptions }>
) => {
	try {
		const plan = await runFlightPlanJob(event.data.geometry, event.data.options, (message) =>
			self.postMessage({ type: 'progress', message })
		);
		self.postMessage({ type: 'complete', plan });
	} catch (error) {
		self.postMessage({
			type: 'error',
			message: error instanceof Error ? error.message : 'Unable to generate a flight plan.'
		});
	}
};
