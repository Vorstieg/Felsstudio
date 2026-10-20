import { test, expect as baseExpect } from '@playwright/test';
import JSZip from 'jszip';
import { writeFile } from 'node:fs/promises';
const expect = baseExpect.configure({ timeout: 20000 });

test('anonymous submission opens as a separate reviewer draft and retries cleanup without republishing', async ({
	page
}) => {
	test.setTimeout(120000);
	let authenticated = false;
	let archive;
	let review;
	let failCleanup = true;
	let reviewDeleted = false;
	const writes = [];
	await page.route('**/api/auth/get-session', (route) =>
		route.fulfill({
			json: authenticated
				? { user: { id: 'reviewer', name: 'Reviewer', email: 'reviewer@example.test' } }
				: null
		})
	);
	await page.route('**/api/fs/**', (route) => {
		if (['PUT', 'MOVE', 'DELETE'].includes(route.request().method())) {
			writes.push(route.request().url());
			return route.fulfill({ json: {} });
		}
		return route.fulfill({ status: 404, json: { error: 'not found' } });
	});
	await page.route(/\/api\/reviews(?:\/|$)/, async (route) => {
		const request = route.request();
		const pathname = new URL(request.url()).pathname;
		if (request.method() === 'POST' && pathname === '/api/reviews') {
			archive = request.postDataBuffer();
			const zip = await JSZip.loadAsync(archive);
			const manifest = JSON.parse(await zip.file('review.json').async('string'));
			review = {
				id: '11111111-1111-4111-8111-111111111111',
				name: manifest.draft.name,
				created: new Date().toISOString(),
				actions: manifest.actions
			};
			return route.fulfill({ status: 201, json: review });
		}
		if (!authenticated) return route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } });
		if (pathname.endsWith('/archive'))
			return route.fulfill({ contentType: 'application/zip', body: archive });
		if (request.method() === 'DELETE') {
			if (failCleanup) {
				failCleanup = false;
				return route.fulfill({ status: 503, json: { message: 'Cleanup temporarily unavailable' } });
			}
			reviewDeleted = true;
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({
			json: pathname === '/api/reviews' ? (reviewDeleted ? [] : [review]) : review
		});
	});
	await page.goto('/');
	await expect(page.getByText('Select Environment', { exact: true })).toBeVisible();
	const originalId = await page.evaluate(async () => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const { createDraft } = await import('/src/lib/state/shared-draft.ts');
		const draft = createDraft('2d');
		draft.placed = true;
		draft.name = 'Submitted wall';
		draft.workspace.entry.properties.name = 'Submitted wall';
		draft.workspace.topo = { routes: [], description: 'Submitted description', image2D: null };
		const png = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA8sAAAAASUVORK5CYII='
			),
			(character) => character.charCodeAt(0)
		);
		draft.workspace.topo.image2D = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
		const imagePath = 'new-crag/new-crag-image-test.png';
		draft.workspace.pendingImages = [
			{
				clientId: 'photo',
				path: imagePath,
				file: new File([png], 'test.png', { type: 'image/png' }),
				previewUrl: ''
			}
		];
		draft.workspace.images = [{ clientId: 'photo', path: imagePath, name: 'test.png' }];
		draft.workspace.dirtyPaths.push('/new-crag/new-crag-topo.json');
		draft.contexts[draft.activeNodeId] = {
			glbBlob: new Blob(['model bytes'], { type: 'model/gltf-binary' })
		};
		await draftsState.save(draft);
		return draft.id;
	});
	await page.goto(`/topos/2d/editor?draft=${originalId}`);
	await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toBeEnabled();
	const more = page.getByRole('button', { name: 'More editor actions', exact: true });
	await expect(
		page.getByRole('button', { name: 'Publish directly to server', exact: true })
	).not.toBeVisible();
	await more.click();
	await expect(page.getByRole('region', { name: 'Editor actions' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('region', { name: 'Editor actions' })).not.toBeVisible();
	await expect(more).toBeFocused();
	await more.click();
	await page.getByRole('button', { name: 'Publish directly to server', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	expect(writes).toEqual([]);
	await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Submitted for review.');
	expect(writes).toEqual([]);
	const zip = await JSZip.loadAsync(archive);
	const manifest = JSON.parse(await zip.file('review.json').async('string'));
	expect(manifest.draft.workspace.topo.description).toBe('Submitted description');
	expect(manifest.assets.some((asset) => asset.type === 'model/gltf-binary')).toBe(true);
	expect(
		manifest.assets.some((asset) => asset.type === 'image/png' && asset.name === 'test.png')
	).toBe(true);
	expect(manifest.assets.some((asset) => asset.keys.at(-1) === 'background')).toBe(true);
	// Retain a browser-produced package for an optional backend contract smoke check.
	await writeFile('/tmp/fels-review-browser.zip', archive);
	await page.getByLabel('Description', { exact: true }).fill('Later local edit');
	authenticated = true;
	await page.goto('/felslager/reviews');
	await page.getByRole('button', { name: 'Submitted wall', exact: true }).click();
	await expect(page.getByText('new-crag/new-crag-topo.json', { exact: true })).toBeVisible();
	await page.screenshot({ path: '/tmp/review-inbox-desktop.png', fullPage: true });
	const desktopViewport = page.viewportSize();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.screenshot({ path: '/tmp/review-inbox-mobile.png', fullPage: true });
	await page.setViewportSize(desktopViewport);
	await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
		'Submitted description'
	);
	const importedId = new URL(page.url()).searchParams.get('draft');
	expect(importedId).not.toBe(originalId);
	await page.getByLabel('Description', { exact: true }).fill('Reviewer correction');
	const navigation = page.getByRole('navigation', { name: 'Draft editors' }).getByRole('combobox');
	await more.click();
	await navigation.selectOption('crag');
	await expect(page.getByRole('button', { name: 'Publish review', exact: true })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Review changes', exact: true })).not.toBeVisible();
	await more.click();
	await expect(page.getByRole('region', { name: 'Editor actions' })).toContainText(
		'reviewer@example.test'
	);
	await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Publish review', exact: true })).toBeEnabled();
	page.on('dialog', () => {
		throw new Error('Publishing must not show an overwrite confirmation');
	});
	await page.getByRole('button', { name: 'Publish review', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Cleanup temporarily unavailable');
	const completed = writes.length;
	expect(completed).toBeGreaterThanOrEqual(3);
	await page.reload();
	await page.getByRole('button', { name: 'Retry review cleanup', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Review published.');
	await page.screenshot({ path: '/tmp/review-editor-desktop.png', fullPage: true });
	await page.getByRole('button', { name: 'Dismiss review message' }).click();
	await more.click();
	await page.screenshot({ path: '/tmp/review-editor-menu-desktop.png', fullPage: true });
	await page.keyboard.press('Escape');
	expect(writes).toHaveLength(completed);
	expect(reviewDeleted).toBe(true);
	const saved = await page.evaluate(async (id) => {
		const { draftsState } = await import('/src/lib/state/drafts.svelte.ts');
		const draft = await draftsState.get(id);
		return { description: draft.workspace.topo.description, reviewId: draft.reviewId };
	}, importedId);
	expect(saved).toEqual({ description: 'Reviewer correction', reviewId: undefined });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(
		page.getByRole('button', { name: 'Submit for review', exact: true })
	).toBeInViewport();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.goto('/felslager/reviews');
	await expect(page.getByRole('button', { name: 'Submitted wall', exact: true })).toHaveCount(0);
});

test('review deletion supports cancellation and removes the submission from the inbox', async ({
	page
}) => {
	let deleted = false;
	let deleteCalls = 0;
	const review = {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Delete this review',
		created: new Date().toISOString(),
		actions: []
	};
	await page.route('**/api/auth/get-session', (route) =>
		route.fulfill({
			json: { user: { id: 'reviewer', name: 'Reviewer', email: 'reviewer@example.test' } }
		})
	);
	await page.route(/\/api\/reviews(?:\/|$)/, (route) => {
		if (route.request().method() === 'DELETE') {
			expect(new URL(route.request().url()).pathname).toBe(`/api/reviews/${review.id}`);
			deleted = true;
			deleteCalls++;
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({ json: deleted ? [] : [review] });
	});
	await page.goto('/felslager/reviews');
	await expect(page.getByRole('link', { name: 'Back to Felslager' })).toHaveCount(0);
	await page.getByRole('button', { name: review.name, exact: true }).click();
	await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	expect(deleteCalls).toBe(0);
	await expect(page.getByRole('button', { name: review.name, exact: true })).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('No submissions to review yet.')).toBeVisible();
	expect(deleteCalls).toBe(1);
	await expect(page.getByRole('button', { name: review.name, exact: true })).toHaveCount(0);
});
