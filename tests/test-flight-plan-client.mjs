import { afterEach, expect, test, vi } from 'vitest';
import { generateFlightPlanInWorker } from '../src/lib/assets/js/flight-plan-client.ts';
class FakeWorker {
	constructor() {
		this.terminate = vi.fn();
		this.postMessage = vi.fn();
		FakeWorker.instances.push(this);
	}
	message(data) {
		this.onmessage({ data });
	}
}
FakeWorker.instances = [];
const geometry = {
	type: 'Polygon',
	coordinates: [
		[
			[11, 47],
			[11.001, 47],
			[11, 47.001],
			[11, 47]
		]
	]
};
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	FakeWorker.instances = [];
});
test('reports progress, returns worker results and ignores late messages', async () => {
	vi.stubGlobal('Worker', FakeWorker);
	const onProgress = vi.fn();
	const pending = generateFlightPlanInWorker(geometry, {}, { onProgress });
	const worker = FakeWorker.instances[0];
	expect(worker.postMessage).toHaveBeenCalledWith({ geometry, options: {} });
	worker.message({ type: 'progress', message: 'Calculating flight path…' });
	worker.message({ type: 'complete', plan: { waypoints: [] } });
	await expect(pending).resolves.toEqual({ waypoints: [] });
	worker.message({ type: 'progress', message: 'late' });
	expect(onProgress).toHaveBeenCalledTimes(1);
	expect(worker.terminate).toHaveBeenCalledTimes(1);
});
test('aborting terminates the worker and rejects the request', async () => {
	vi.stubGlobal('Worker', FakeWorker);
	const controller = new AbortController();
	const pending = generateFlightPlanInWorker(geometry, {}, { signal: controller.signal });
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
	await expect(
		generateFlightPlanInWorker(geometry, {}, { signal: controller.signal })
	).rejects.toMatchObject({ name: 'AbortError' });
	expect(FakeWorker.instances).toHaveLength(1);
});
test('worker failures and timeouts clean up their background jobs', async () => {
	vi.stubGlobal('Worker', FakeWorker);
	vi.useFakeTimers();
	const failed = generateFlightPlanInWorker(geometry, {});
	FakeWorker.instances[0].message({ type: 'error', message: 'Terrain is unavailable' });
	await expect(failed).rejects.toThrow('Terrain is unavailable');
	const pending = generateFlightPlanInWorker(geometry, {});
	const assertion = expect(pending).rejects.toThrow('took too long');
	await vi.advanceTimersByTimeAsync(120000);
	await assertion;
	expect(FakeWorker.instances[1].terminate).toHaveBeenCalledTimes(1);
});

test('rejects oversized polygons before constructing or cloning a worker request', async () => {
	vi.stubGlobal('Worker', FakeWorker);
	const oversized = {
		type: 'Polygon',
		coordinates: [Array.from({ length: 1001 }, () => [11, 47])]
	};
	await expect(generateFlightPlanInWorker(oversized, {})).rejects.toThrow(
		'Polygon vertices exceed'
	);
	expect(FakeWorker.instances).toHaveLength(0);
});
