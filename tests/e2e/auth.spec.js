import { test, expect } from '@playwright/test';

const identity = () => ({
	id: 'current-user',
	name: 'Test Editor',
	email: 'editor@example.com'
});

async function mockApi(page, options = {}) {
	const state = {
		user: options.user || null,
		writes: [],
		expireNextWrite: false
	};
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		if (!new URL(request.url()).pathname.startsWith('/api/')) return route.fallback();
		const path = new URL(request.url()).pathname.replace(/^\/api/, '');
		const method = request.method();
		const body = request.postData();
		const respond = (data, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
		if (path === '/auth/get-session')
			return respond(state.user ? { user: state.user, session: { id: 'mock-session' } } : null);
		if (path === '/auth/sign-in/email') {
			state.user = identity();
			return respond({ redirect: false, token: 'mock-session', user: state.user });
		}
		if (path === '/auth/sign-out') {
			state.user = null;
			return respond({ success: true });
		}
		if (path.startsWith('/fs')) {
			if (method === 'PUT') {
				state.writes.push({ path, body, authorization: request.headers().authorization });
				if (state.expireNextWrite) {
					state.expireNextWrite = false;
					state.user = null;
					return respond({ code: 'AUTH_REQUIRED', message: 'Session expired' }, 401);
				}
				return respond({ success: true });
			}
			if (path === '/fs/note.txt')
				return route.fulfill({ contentType: 'text/plain', body: 'Original content' });
			return respond([{ name: 'note.txt', type: 'file', size: 16 }]);
		}
		return respond({ code: 'UNEXPECTED_TEST_REQUEST', message: path }, 404);
	});
	return state;
}

async function openTextEditor(page) {
	await page.goto('/felslager/edit');
	await page.getByText('note.txt', { exact: true }).click();
	await expect(page.getByRole('main').locator('textarea')).toHaveValue('Original content');
	await page.getByRole('main').locator('textarea').fill('My unsaved climbing notes');
}
async function login(page) {
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Email', { exact: true }).fill('editor@example.com');
	await dialog.getByLabel('Password', { exact: true }).fill('a-strong-password');
	await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('anonymous save prompts for login, preserves edits and resumes the queued save', async ({
	page
}) => {
	const state = await mockApi(page);
	await openTextEditor(page);
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.getByRole('dialog').getByLabel('Email', { exact: true })).toBeFocused();
	expect(state.writes).toHaveLength(0);
	await login(page);
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect.poll(() => state.writes.length).toBe(1);
	expect(state.writes[0]).toMatchObject({
		body: 'My unsaved climbing notes',
		authorization: undefined
	});
	await expect(page.getByRole('main').locator('textarea')).toHaveValue('My unsaved climbing notes');
});

test('a rejected save requires an explicit retry after reauthentication', async ({ page }) => {
	const state = await mockApi(page, { user: identity() });
	state.expireNextWrite = true;
	await openTextEditor(page);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await login(page);
	await expect(page.getByRole('dialog')).not.toBeVisible();
	expect(state.writes).toHaveLength(1);
	await expect(page.getByRole('main').locator('textarea')).toHaveValue('My unsaved climbing notes');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.poll(() => state.writes.length).toBe(2);
});

test('login and logout preserve localStorage metadata and IndexedDB draft contents', async ({
	page
}) => {
	await mockApi(page);
	await openTextEditor(page);
	const draft = {
		id: 'local-browser-draft',
		name: 'My local topo',
		topo: { description: 'Unsynced local work', routes: [] }
	};
	await page.evaluate(async (draft) => {
		localStorage.setItem(
			'topo_drafts_v1',
			JSON.stringify([
				{ id: draft.id, name: draft.name, editorMode: '2d', updated: '2026-10-15T12:00:00Z' }
			])
		);
		await new Promise((resolve, reject) => {
			const request = indexedDB.open('TopoCreatorDB', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('topos', { keyPath: 'id' });
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const db = request.result;
				const transaction = db.transaction('topos', 'readwrite');
				transaction.objectStore('topos').put(draft);
				transaction.oncomplete = () => {
					db.close();
					resolve();
				};
				transaction.onerror = () => reject(transaction.error);
			};
		});
	}, draft);
	const metadata = await page.evaluate(() => localStorage.getItem('topo_drafts_v1'));
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await login(page);
	await expect(page.getByRole('dialog')).not.toBeVisible();
	const header = page.getByRole('main').locator('header');
	await expect(header.getByRole('group', { name: 'Account', exact: true })).toContainText(
		'Test Editor'
	);
	await expect(header.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
	await header.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('group', { name: 'Account', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('topo_drafts_v1'))).toBe(metadata);
	const stored = await page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const request = indexedDB.open('TopoCreatorDB', 1);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const read = db.transaction('topos').objectStore('topos').get('local-browser-draft');
					read.onsuccess = () => {
						db.close();
						resolve(read.result);
					};
					read.onerror = () => reject(read.error);
				};
			})
	);
	expect(stored).toEqual(draft);
});

test('focus refresh reflects session revocation', async ({ page }) => {
	const state = await mockApi(page, { user: identity() });
	await openTextEditor(page);
	state.user = null;
	const refreshed = page.waitForResponse('**/api/auth/get-session');
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await refreshed;
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(state.writes).toHaveLength(0);
});

test.describe('German authentication', () => {
	test.use({ locale: 'de-AT' });
	test('uses translated fields and closes the focused dialog with Escape', async ({ page }) => {
		await mockApi(page);
		await openTextEditor(page);
		await page.getByRole('button', { name: 'Speichern', exact: true }).click();
		await expect(page.getByRole('dialog').getByLabel('E-Mail', { exact: true })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('dialog').getByLabel('Passwort', { exact: true })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});
});
