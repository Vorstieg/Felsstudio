import { test, expect as baseExpect } from '@playwright/test';

test.setTimeout(120000);
const expect = baseExpect.configure({ timeout: 20000 });

async function seedDraft(page) {
	await page.route('**/api/auth/get-session', (route) =>
		route.fulfill({ contentType: 'application/json', body: 'null' })
	);
	await page.route('**/api/fs/**', (route) =>
		route.fulfill({ contentType: 'application/json', body: '[]' })
	);
	await page.goto('/');
	await expect(page.getByText('Select Environment', { exact: true })).toBeVisible();
	return page.evaluate(async () => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const { createDraft } = await import('/src/lib/state/shared-draft.ts');
		const draft = createDraft('crag', {
			workspace: {
				entry: {
					type: 'Feature',
					properties: { id: 'wall', name: 'Original crag', kind: 'crag' },
					geometry: { type: 'Point', coordinates: [16, 48] }
				},
				path: '',
				childEntries: [],
				topo: { description: 'Original topo', routes: [], image2D: null },
				access: { type: 'FeatureCollection', features: [] },
				dirtyPaths: [],
				removedPaths: [],
				images: [],
				documentsLoaded: true,
				detailsLoaded: true,
				pendingImages: []
			},
			activeWorkspaceEntryPath: 'wall',
			activeMetadataTarget: 'wall'
		});
		await draftsState.save(draft);
		return draft.id;
	});
}

async function readDraft(page, id) {
	return page.evaluate(async (id) => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const session = await draftsState.get(id);
		return { name: session.workspace.entry.properties.name, topo: session.workspace.topo };
	}, id);
}

test('one anonymous draft survives crag, 2D, and 3D switches and reload', async ({ page }) => {
	const writes = [];
	page.on('request', (request) => {
		if (['PUT', 'DELETE', 'MOVE'].includes(request.method())) writes.push(request.url());
	});
	const id = await seedDraft(page);
	await page.goto(`/topos/2d/editor?draft=${id}`);
	const navigation = page.getByRole('navigation', { name: 'Draft editors' });
	await expect(navigation.getByRole('combobox')).toBeEnabled();
	await expectBesideSave(page);
	await page.getByLabel('Description', { exact: true }).fill('Edited in 2D');
	await navigation.getByRole('combobox').selectOption('crag');
	await expect(page).toHaveURL(/\/crags\/editor\?draft=/);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Original crag');
	await expectBesideSave(page);
	await page.getByLabel('Name', { exact: true }).fill('Edited crag');
	await navigation.getByRole('combobox').selectOption('3d');
	await expect(page).toHaveURL(/\/topos\/3d\/editor\?draft=/);
	await expect(navigation.getByRole('combobox')).toBeEnabled();
	await expectBesideSave(page);
	await navigation.getByRole('combobox').selectOption('2d');
	await expect(page).toHaveURL(/\/topos\/2d\/editor\?draft=/);
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Edited in 2D');
	await page.reload();
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Edited in 2D');
	expect(await readDraft(page, id)).toMatchObject({
		name: 'Edited crag',
		topo: { description: 'Edited in 2D' }
	});
	expect(writes).toEqual([]);
});

test('a failed IndexedDB transaction prevents switching editors and keeps unsaved input', async ({
	page
}) => {
	const id = await seedDraft(page);
	await page.goto(`/topos/2d/editor?draft=${id}`);
	const navigation = page.getByRole('navigation', { name: 'Draft editors' });
	await expect(navigation.getByRole('combobox')).toBeEnabled();
	await page.getByLabel('Description', { exact: true }).fill('Keep this unsaved edit');
	await page.evaluate(() => {
		IDBObjectStore.prototype.put = function () {
			throw new DOMException('Storage full', 'QuotaExceededError');
		};
	});
	await navigation.getByRole('combobox').selectOption('crag');
	await expect(navigation.getByRole('alert')).toContainText('Storage full');
	await expect(page).toHaveURL(/\/topos\/2d\/editor\?draft=/);
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
		'Keep this unsaved edit'
	);
});

test('uploaded images, backgrounds, and models survive a real IndexedDB reload', async ({
	page
}) => {
	const id = await seedDraft(page);
	await page.evaluate(async (id) => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const draft = await draftsState.get(id);
		const file = new File(['pending-image'], 'wall.png', { type: 'image/png' });
		draft.workspace.images.push({ name: file.name, path: 'wall/wall.png', clientId: 'image-1' });
		draft.workspace.pendingImages = [
			{ file, path: 'wall/wall.png', clientId: 'image-1', previewUrl: URL.createObjectURL(file) }
		];
		draft.workspace.topo.image2D = 'data:image/png;base64,aW1hZ2U=';
		draft.contexts[draft.activeNodeId] = {
			glbBlob: new Blob(['model-data'], { type: 'model/gltf-binary' })
		};
		await draftsState.save(draft);
	}, id);
	await page.reload();
	const restored = await page.evaluate(async (id) => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const { createDraftResources } = await import('/src/lib/state/shared-draft.ts');
		const resources = createDraftResources();
		const draft = resources.restore(await draftsState.get(id));
		const result = {
			image: await draft.workspace.pendingImages[0].file.text(),
			name: draft.workspace.pendingImages[0].file.name,
			model: await draft.contexts[draft.activeNodeId].glbBlob.text(),
			background: await (await fetch(draft.workspace.topo.image2D)).text()
		};
		resources.release();
		return result;
	}, id);
	expect(restored).toEqual({
		image: 'pending-image',
		name: 'wall.png',
		model: 'model-data',
		background: 'image'
	});
});

test('a fresh topo has its draft and node IDs before the first editor switch', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route('**/api/auth/get-session', (route) =>
		route.fulfill({ contentType: 'application/json', body: 'null' })
	);
	await page.goto('/topos/2d/editor');
	const navigation = page.getByRole('navigation', { name: 'Draft editors' });
	await expect(navigation.getByRole('combobox')).toBeEnabled({
		timeout: 20000
	});
	await expectBesideSave(page);
	const id = new URL(page.url()).searchParams.get('draft');
	expect(id).toBeTruthy();
	await navigation.getByRole('combobox').selectOption('crag');
	await expect(page).toHaveURL(/\/crags\/editor\?draft=/);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('New Crag');
	await expectBesideSave(page);
	expect(new URL(page.url()).searchParams.get('draft')).toBe(id);
	expect(new URL(page.url()).searchParams.get('node')).toBeTruthy();
});

test('adding a model keeps the draft and its existing topo edits', async ({ page }) => {
	const id = await seedDraft(page);
	await page.goto(`/topos/3d/upload?draft=${id}`);
	const launch = page.getByRole('button', { name: 'Launch Workspace' });
	await expect(launch).toBeEnabled();
	await page.locator('#glb-model').setInputFiles({
		name: 'model.glb',
		mimeType: 'model/gltf-binary',
		buffer: Buffer.from(
			JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] })
		)
	});
	await launch.click();
	await expect(page).toHaveURL(/\/topos\/3d\/editor\?draft=/);
	expect(new URL(page.url()).searchParams.get('draft')).toBe(id);
	const navigation = page.getByRole('navigation', { name: 'Draft editors' });
	await expectBesideSave(page);
	await navigation.getByRole('combobox').selectOption('2d');
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Original topo');
	await page.reload();
	expect(
		await page.evaluate(async (id) => {
			const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
			const draft = await draftsState.get(id);
			return (await draft.contexts[draft.activeNodeId].glbBlob.text()).includes('2.0');
		}, id)
	).toBe(true);
});

async function expectBesideSave(page) {
	const select = await page.getByRole('combobox', { name: 'Draft editors' }).boundingBox();
	const save = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
	expect(select).not.toBeNull();
	expect(save).not.toBeNull();
	expect(select.y).toBeLessThan(60);
	expect(Math.abs(select.y - save.y)).toBeLessThan(10);
	expect(save.x + save.width).toBeLessThanOrEqual(select.x);
	expect(save.x).toBeGreaterThanOrEqual(0);
	expect(select.x + select.width).toBeLessThanOrEqual(page.viewportSize().width);
	await page.screenshot({ path: test.info().outputPath('toolbar.png') });
}
