import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const controls = JSON.parse(
	readFileSync(new URL('../fixtures/processing-options.json', import.meta.url), 'utf8')
);
async function setup(page) {
	const capture = {
		id: 'capture',
		name: 'Flight',
		entryPath: 'austria/wall',
		files: [],
		totalBytes: 0,
		uploadedCount: 0,
		activeJobIds: []
	};
	const state = { capture: null, runs: [], uploads: [], fail: true, creates: 0 };
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		if (!path.startsWith('/api/')) return route.fallback();
		const method = request.method();
		const respond = (json, status = 200) => route.fulfill({ json, status });
		if (path === '/api/auth/get-session')
			return respond({ user: { id: 'editor', name: 'Editor', email: 'editor@example.com' } });
		if (path === '/api/processing/options') return respond(controls);
		if (path === '/api/captures') {
			if (method === 'GET') return respond(state.capture ? [state.capture] : []);
			state.creates++;
			state.capture = { ...capture, ...request.postDataJSON() };
			return respond(state.capture, 201);
		}
		if (path === '/api/captures/capture') return respond(state.capture);
		if (path === '/api/captures/capture/files') {
			const filename = url.searchParams.get('path');
			state.uploads.push(filename);
			if (filename === 'second.jpg' && state.fail) {
				state.fail = false;
				return respond({ code: 'UPLOAD_INTERRUPTED' }, 503);
			}
			state.capture.files.push({ path: filename, bytes: 5 });
			state.capture.uploadedCount++;
			return respond({ path: filename, bytes: 5 }, 201);
		}
		if (path === '/api/processing') {
			if (method === 'GET') return respond(state.runs);
			const run = {
				...request.postDataJSON(),
				id: 'run',
				entryPath: capture.entryPath,
				status: 'queued',
				phase: 'reconstruction',
				stage: 'queued',
				progress: 0
			};
			state.runs.push(run);
			return respond(run, 202);
		}
		if (path === '/api/processing/run/cancel') {
			state.runs[0].cancelRequested = true;
			state.runs[0].status = 'processing';
			return respond(state.runs[0], 202);
		}
		return respond({ code: `Unexpected ${path}` }, 404);
	});
	await page.goto('/felslager/captures/austria/wall');
	await expect(page.getByRole('button', { name: 'New capture', exact: true })).toBeVisible({
		timeout: 15000
	});
	await expect(page.getByRole('definition').filter({ hasText: 'austria/wall' })).toBeVisible();
	await expect(page.getByLabel('Entry path', { exact: true })).toHaveCount(0);
	expect(new URL(page.url()).searchParams.has('entryPath')).toBe(false);
	return state;
}
test('upload retry reuses originals and processing is a separate action', async ({ page }) => {
	const state = await setup(page);
	await page.getByLabel('Name', { exact: true }).fill('Flight');
	await page.getByLabel('Photos, videos and SRT files').setInputFiles([
		{ name: 'first.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') },
		{ name: 'second.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') }
	]);
	await page.getByRole('button', { name: 'Upload / retry files', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('UPLOAD_INTERRUPTED');
	expect(state.runs).toHaveLength(0);
	await page.getByRole('button', { name: 'Upload / retry files', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	expect(state.creates).toBe(1);
	expect(state.uploads).toEqual(['first.mp4', 'second.jpg', 'second.jpg']);
	await expect(page.getByRole('button', { name: 'Start processing', exact: true })).toBeEnabled();
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await expect(page.getByLabel('Photos, videos and SRT files')).toHaveCount(0);
	await page.getByRole('button', { name: /^Flight/ }).click();
	await page.getByRole('button', { name: 'Start processing', exact: true }).click();
	await expect.poll(() => state.runs.length).toBe(1);
	expect(state.runs[0]).toMatchObject({
		captureId: 'capture',
		engine: 'odm',
		runBoltDetection: false
	});
	await page.getByRole('button', { name: 'Cancel job', exact: true }).click();
	await expect(page.locator('article').getByText('Cancelling', { exact: false })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cancel job', exact: true })).toBeDisabled();
});
test('existing captures survive reload and can feed several engines', async ({ page }) => {
	const state = await setup(page);
	state.capture = {
		id: 'capture',
		name: 'Saved flight',
		entryPath: 'austria/wall',
		files: [{ path: 'video.mp4', bytes: 10 }],
		totalBytes: 10,
		uploadedCount: 1
	};
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await page.getByRole('button', { name: /^Saved flight/ }).click();
	await expect(page.getByRole('button', { name: /^Saved flight/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page
		.getByRole('combobox', { name: 'Reconstruction engine', exact: true })
		.selectOption('meshroom');
	await page.getByLabel('Detect bolts').check();
	await page.getByRole('spinbutton', { name: 'Video sampling interval', exact: true }).fill('2');
	await page
		.getByRole('combobox', { name: 'Reconstruction quality', exact: true })
		.selectOption('detailed');
	await page.getByRole('spinbutton', { name: 'Minimum confidence', exact: true }).fill('0.35');
	await page
		.getByRole('combobox', { name: 'Bolt placement method', exact: true })
		.selectOption('multiview');
	await page.getByRole('button', { name: 'Start processing', exact: true }).click();
	await expect.poll(() => state.runs.length).toBe(1);
	expect(state.runs[0]).toMatchObject({
		captureId: 'capture',
		engine: 'meshroom',
		runBoltDetection: true,
		options: {
			preparing: { videoFrameIntervalSeconds: 2 },
			reconstructing: { quality: 'detailed' },
			detecting: { confidence: 0.35 },
			positioning: { method: 'multiview' }
		}
	});
	expect(state.creates).toBe(0);
	state.runs[0] = {
		...state.runs[0],
		status: 'processing',
		stage: 'detecting',
		progress: 75,
		stageCurrent: 12,
		stageTotal: 30
	};
	await expect(page.getByText('Detecting bolts · 75% · 12 / 30')).toBeVisible();
});

test('completed results import into a durable draft with private assets', async ({ page }) => {
	const state = await setup(page);
	state.runs = [
		{
			id: 'run',
			captureId: 'capture',
			entryPath: 'austria/wall',
			name: 'Wall',
			engine: 'meshroom',
			status: 'completed',
			phase: 'reconstruction',
			stage: 'completed',
			progress: 100
		}
	];
	await page.route('**/api/processing/run/results**', async (route) => {
		const url = new URL(route.request().url());
		if (!url.pathname.endsWith('/files'))
			return route.fulfill({
				json: {
					processingId: 'run',
					captureId: 'capture',
					entryPath: 'austria/wall',
					engine: 'meshroom',
					files: [{ path: 'model.glb' }, { path: 'project.json' }, { path: 'telemetry/flight.srt' }]
				}
			});
		const path = url.searchParams.get('path');
		if (path === 'project.json')
			return route.fulfill({
				json: { name: 'Wall', hits: [], cameras: { photo: [1, 2, 3] }, coordinateSystem: 'Y_UP' }
			});
		if (path === 'model.glb')
			return route.fulfill({
				body: JSON.stringify({
					asset: { version: '2.0' },
					scene: 0,
					scenes: [{ nodes: [] }],
					nodes: []
				})
			});
		return route.fulfill({ body: 'telemetry bytes' });
	});
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await page.getByRole('button', { name: 'Import into Studio', exact: true }).click();
	await expect(page).toHaveURL(/\/topos\/3d\/editor\?draft=/);
	const url = new URL(page.url());
	const id = url.searchParams.get('draft');
	expect(url.searchParams.has('node')).toBe(false);
	const node = await page.evaluate(async (id) => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		return (await draftsState.get(id)).activeNodeId;
	}, id);
	await expect
		.poll(() =>
			page.evaluate(
				async ({ id, node }) => {
					const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
					const saved = await draftsState.get(id);
					return saved.processingImports[node].pendingFiles?.length || 0;
				},
				{ id, node }
			)
		)
		.toBe(0);
	await page.reload();
	const saved = await page.evaluate(
		async ({ id, node }) => {
			const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
			const draft = await draftsState.get(id);
			return {
				model: await draft.contexts[node].glbBlob.text(),
				camera: draft.contexts[node].clustering.cameraPositions.photo,
				telemetry: await draft.processingImports[node].files['telemetry/flight.srt'].text(),
				path: draft.workspace.path
			};
		},
		{ id, node }
	);
	expect(saved.model).toContain('2.0');
	expect(saved.camera).toEqual([1, 2, 3]);
	expect(saved.telemetry).toBe('telemetry bytes');
	expect(saved.path).toBe('austria/wall');
});

test('step restarts retain the selected source and original result', async ({ page }) => {
	const state = await setup(page);
	state.runs = [
		{
			id: 'source',
			name: 'Original bolts',
			captureId: 'capture',
			entryPath: 'austria/wall',
			engine: 'odm',
			runBoltDetection: true,
			boltPlacementMethod: 'triangle',
			status: 'completed',
			stage: 'completed',
			progress: 100,
			availableStartSteps: ['preparing', 'reconstructing', 'detecting', 'positioning']
		}
	];
	const methods = [];
	const steps = [];
	const options = [];
	await page.route('**/api/processing/source/runs', async (route) => {
		const body = route.request().postDataJSON();
		methods.push(body.options.positioning.method);
		steps.push(body.fromStep);
		options.push(body);
		const child = {
			...state.runs[0],
			id: `child-${methods.length}`,
			sourceProcessingId: 'source',
			options: body.options,
			boltPlacementMethod: body.options.positioning.method,
			startStep: body.fromStep,
			status: 'queued',
			stage: 'queued',
			progress: 0,
			availableStartSteps: []
		};
		state.runs.push(child);
		await route.fulfill({ json: child, status: 202 });
	});
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	const source = page
		.locator('article')
		.filter({ has: page.getByRole('heading', { name: 'Original bolts', exact: true }) });
	await source.locator('details').first().locator(':scope > summary').click();
	await source
		.getByRole('combobox', { name: 'Start from step', exact: true })
		.selectOption('positioning');
	for (const [step, method] of [
		['positioning', 'vertex'],
		['detecting', 'multiview'],
		['reconstructing', 'triangle'],
		['preparing', 'triangle']
	]) {
		await source.getByRole('combobox', { name: 'Start from step', exact: true }).selectOption(step);
		if (['preparing', 'reconstructing'].includes(step)) {
			await source
				.getByRole('combobox', { name: 'Reconstruction engine', exact: true })
				.selectOption(step === 'preparing' ? 'meshroom' : 'realityscan');
			await source.getByLabel('Detect bolts', { exact: true }).check();
		} else {
			await expect(
				source.getByRole('combobox', { name: 'Reconstruction engine', exact: true })
			).toHaveCount(0);
		}

		await source
			.getByRole('combobox', { name: 'Bolt placement method', exact: true })
			.selectOption(method);
		await source.getByRole('button', { name: 'Create new run', exact: true }).click();
		await expect(page.locator('article')).toHaveCount(methods.length + 1);
	}
	expect(methods).toEqual(['vertex', 'multiview', 'triangle', 'triangle']);
	expect(steps).toEqual(['positioning', 'detecting', 'reconstructing', 'preparing']);
	expect(options[0]).toEqual({
		fromStep: 'positioning',
		options: { positioning: { method: 'vertex' } }
	});
	expect(options[1]).toEqual({
		fromStep: 'detecting',
		options: { positioning: { method: 'multiview' } }
	});
	expect(options[2]).toMatchObject({ engine: 'realityscan', runBoltDetection: true });
	expect(options[3]).toMatchObject({ engine: 'meshroom', runBoltDetection: true });

	expect(state.creates).toBe(0);
	expect(state.runs[0].status).toBe('completed');
	await expect(page.getByRole('button', { name: 'Import into Studio', exact: true })).toHaveCount(
		1
	);
});

test('completed runs explain unavailable restart actions', async ({ page }) => {
	const state = await setup(page);
	const completed = {
		name: 'Completed',
		captureId: 'capture',
		entryPath: 'austria/wall',
		engine: 'odm',
		status: 'completed',
		stage: 'completed',
		progress: 100
	};
	state.runs = [
		{ ...completed, id: 'old-api', runBoltDetection: true },
		{ ...completed, id: 'no-detection', runBoltDetection: false, availableStartSteps: [] },
		{ ...completed, id: 'missing-files', runBoltDetection: true, availableStartSteps: [] }
	];
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await expect(page.locator('article')).toHaveCount(3);
	for (const summary of await page.locator('article summary').all()) await summary.click();
	const buttons = page.getByRole('button', { name: 'Create new run', exact: true });
	await expect(buttons).toHaveCount(3);
	for (const button of await buttons.all()) await expect(button).toBeDisabled();
	await expect(page.getByText('No restart steps are available.', { exact: false })).toHaveCount(3);
});

test('capture library keeps selection between tabs and fits small screens', async ({ page }) => {
	const state = await setup(page);
	state.capture = {
		id: 'capture',
		name: 'North wall',
		entryPath: 'austria/wall',
		files: [{ path: 'flight/DJI_001.jpg', bytes: 5242880 }],
		totalBytes: 5242880,
		uploadedCount: 1
	};
	state.runs = [
		{
			id: 'north-run',
			captureId: 'capture',
			name: 'North wall model',
			entryPath: 'austria/wall',
			engine: 'odm',
			status: 'processing',
			stage: 'reconstructing',
			progress: 64
		}
	];
	await page.reload();
	await page.getByRole('button', { name: /^North wall/ }).click();
	await expect(page.getByRole('button', { name: /^North wall/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: /flight\/DJI_001.jpg/ })).toBeVisible();
	await page.getByRole('textbox', { name: 'Search captures' }).fill('missing');
	await expect(page.getByRole('button', { name: /^North wall/ })).toHaveCount(0);
	await page.getByRole('textbox', { name: 'Search captures' }).fill('north');
	await expect(page.getByRole('button', { name: /^North wall/ })).toBeVisible();
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await expect(page.getByRole('button', { name: /^North wall/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Start processing', exact: true })).toBeEnabled();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.getByRole('link', { name: 'Original files', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'North wall', exact: true })).toBeVisible();
	await page.screenshot({ path: '/tmp/capture-library-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
	await page.screenshot({ path: '/tmp/capture-library-mobile.png', fullPage: true });
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await page.getByRole('button', { name: 'New capture', exact: true }).click();
	await expect(page).toHaveURL(/\/felslager\/captures\/austria\/wall(?:\?|$)/);
	await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
});

test('switching tabs keeps the workspace mounted and preserves unfinished setup', async ({
	page
}) => {
	await setup(page);
	await page.getByLabel('Name', { exact: true }).fill('Unfinished capture');
	await page
		.getByLabel('Photos, videos and SRT files')
		.setInputFiles([{ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') }]);
	await page
		.getByRole('combobox', { name: 'Reconstruction engine', exact: true })
		.selectOption('meshroom');
	await page.getByLabel('Detect bolts').check();
	const workspace = await page.locator('.processing-studio').elementHandle();
	const library = await page
		.getByRole('complementary', { name: 'Capture library' })
		.elementHandle();
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await expect(page).toHaveURL(/\/felslager\/reconstruct\/austria\/wall(?:\?|$)/);
	expect(await workspace.evaluate((node) => node.isConnected)).toBe(true);
	expect(await library.evaluate((node) => node.isConnected)).toBe(true);
	await expect(
		page.getByRole('combobox', { name: 'Reconstruction engine', exact: true })
	).toHaveValue('meshroom');
	await expect(page.getByLabel('Detect bolts')).toBeChecked();
	await page.goBack();
	await expect(page).toHaveURL(/\/felslager\/captures\/austria\/wall(?:\?|$)/);
	expect(await workspace.evaluate((node) => node.isConnected)).toBe(true);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unfinished capture');
	await expect(
		page.getByRole('button', { name: 'Upload / retry files', exact: true })
	).toBeEnabled();
});

test('opens the model while 200 bolt images are still blocked', async ({ page }) => {
	const state = await setup(page);
	state.runs = [
		{
			id: 'fast',
			captureId: 'capture',
			name: 'Fast wall',
			entryPath: 'austria/wall',
			engine: 'odm',
			status: 'completed',
			stage: 'completed',
			progress: 100
		}
	];
	const paths = Array.from({ length: 200 }, (_, i) => `crops/${i}.jpg`);
	let requests = 0;
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	await page.route('**/api/processing/fast/results**', async (route) => {
		const url = new URL(route.request().url());
		if (!url.pathname.endsWith('/files'))
			return route.fulfill({
				json: {
					processingId: 'fast',
					captureId: 'capture',
					entryPath: 'austria/wall',
					engine: 'odm',
					files: ['model.glb', 'project.json', ...paths].map((path) => ({ path }))
				}
			});
		const path = url.searchParams.get('path');
		if (path === 'model.glb')
			return route.fulfill({
				json: { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] }
			});
		if (path === 'project.json')
			return route.fulfill({
				json: {
					name: 'Fast wall',
					coordinateSystem: 'Y_UP',
					hits: paths.map((crop, i) => ({
						pos: [i * 0.1, 0, 0],
						cam_pos: [0, 0, 2],
						conf: 0.9,
						class: 'bolt',
						img: `frame-${i}.jpg`,
						crop,
						edge_dist: 0.1,
						normal_dot: 0.9,
						cam_dist: 2
					}))
				}
			});
		requests++;
		await gate;
		await route.fulfill({ body: 'crop', contentType: 'image/jpeg' });
	});
	try {
		await page.getByRole('link', { name: 'Processing', exact: true }).click();
		await page.getByRole('button', { name: 'Import into Studio', exact: true }).click();
		await expect(page).toHaveURL(/\/topos\/3d\/editor\?draft=/);
		await expect(
			page.getByRole('button', { name: 'More editor actions', exact: true })
		).toBeVisible();
		await expect.poll(() => requests).toBe(2);
		const url = new URL(page.url());
		const saved = await page.evaluate(async (id) => {
			const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
			return draftsState.get(id);
		}, url.searchParams.get('draft'));
		expect(saved.processingImports[saved.activeNodeId].pendingFiles).toHaveLength(200);
	} finally {
		release();
	}
});

test('changing the entry route refreshes scope while the global library stays available', async ({
	page
}) => {
	await setup(page);
	const filters = [];
	await page.route('**/api/captures?**', async (route) => {
		filters.push(new URL(route.request().url()).searchParams.get('entryPath'));
		await route.fulfill({ json: [] });
	});
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/felslager/captures/italy/second-wall';
		link.textContent = 'Other entry';
		document.body.append(link);
	});
	await page.getByRole('link', { name: 'Other entry', exact: true }).click();
	await expect(page.getByRole('definition').filter({ hasText: 'italy/second-wall' })).toBeVisible();
	await expect.poll(() => filters.includes('italy/second-wall')).toBe(true);
	await page.getByRole('link', { name: 'Processing', exact: true }).click();
	await expect(page).toHaveURL(/\/felslager\/reconstruct\/italy\/second-wall/);
	expect(new URL(page.url()).searchParams.has('entryPath')).toBe(false);
	await page.goto('/felslager/captures');
	await expect(page.getByLabel('Entry path', { exact: true })).toBeVisible();
});
