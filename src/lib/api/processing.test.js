import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ handleRejection: vi.fn() }));
vi.mock('./auth.svelte', () => ({ authState: auth }));
import {
	uploadCaptureFile,
	getProcessingControls,
	restartProcessing,
	startProcessing,
	deleteProcessing,
	downloadResultFile
} from './processing';
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({}),
			blob: async () => new Blob(['result'])
		})
	);
});
it('uploads unchanged originals with encoded relative paths and cookies', async () => {
	const file = new File(['video bytes'], 'flight.mp4');
	await uploadCaptureFile('capture', 'flight one/video.mp4', file);
	expect(fetch).toHaveBeenCalledWith(
		expect.stringContaining('/api/captures/capture/files?path=flight%20one%2Fvideo.mp4'),
		expect.objectContaining({ credentials: 'include', method: 'PUT', body: file })
	);
});
it('queues runs from captures without publishing paths or upload counts', async () => {
	await startProcessing('capture', 'meshroom', false, 'Wall');
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
		captureId: 'capture',
		engine: 'meshroom',
		runBoltDetection: false,
		name: 'Wall',
		boltPlacementMethod: 'triangle'
	});
});
it('accepts empty deletion responses', async () => {
	fetch.mockResolvedValue({ ok: true, status: 204 });
	await expect(deleteProcessing('run')).resolves.toBeUndefined();
});
it('downloads results privately', async () => {
	await downloadResultFile('run', 'crops/a b.jpg');
	expect(fetch).toHaveBeenCalledWith(
		expect.stringContaining('/processing/run/results/files?path=crops%2Fa%20b.jpg'),
		{ credentials: 'include' }
	);
});
it('reports session expiry without replaying requests', async () => {
	fetch.mockResolvedValue({
		ok: false,
		status: 401,
		json: async () => ({ code: 'AUTH_REQUIRED' })
	});
	await expect(startProcessing('capture', 'odm', true)).rejects.toMatchObject({
		code: 'AUTH_REQUIRED',
		status: 401
	});
	expect(auth.handleRejection).toHaveBeenCalledWith(401);
	expect(fetch).toHaveBeenCalledOnce();
});

it.each(['triangle', 'vertex', 'multiview'])(
	'submits %s bolt placement to Felslager',
	async (method) => {
		await startProcessing('capture', 'odm', true, undefined, method);
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
			boltPlacementMethod: method,
			runBoltDetection: true
		});
	}
);

it.each(['preparing', 'reconstructing', 'detecting', 'positioning'])(
	'restarts from %s with inherited options',
	async (fromStep) => {
		await restartProcessing('source run', { fromStep, boltPlacementMethod: 'multiview' });
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('/processing/source%20run/runs'),
			expect.objectContaining({ credentials: 'include', method: 'POST' })
		);
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
			fromStep,
			boltPlacementMethod: 'multiview'
		});
	}
);

it('passes explicit reconstruction restart options to the new run endpoint', async () => {
	const options = {
		fromStep: 'reconstructing',
		engine: 'realityscan',
		runBoltDetection: false,
		name: 'Retry reconstruction'
	};
	await restartProcessing('failed-run', options);
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(options);
});

it('sends structured step options without the legacy placement alias', async () => {
	const options = {
		preparing: { videoFrameIntervalSeconds: 2 },
		positioning: { method: 'multiview', minViews: 5 }
	};
	await startProcessing('capture', 'odm', true, 'Wall', undefined, options);
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
		captureId: 'capture',
		engine: 'odm',
		runBoltDetection: true,
		name: 'Wall',
		options
	});
});

it('loads processing control metadata with the session cookie', async () => {
	await getProcessingControls();
	expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/processing/options'), {
		credentials: 'include'
	});
});
