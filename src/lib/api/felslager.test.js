import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ handleRejection: vi.fn() }));
vi.mock('./auth.svelte.ts', () => ({ authState: auth }));
import { deleteFile, fileUrl, listDir, renameFile, writeFile, writeJson } from './felslager.ts';
const baseUrl = import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs';
describe('Felslager API client', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		auth.handleRejection.mockReset();
	});
	it('keeps public reads anonymous', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
		await listDir('///entries//', { recursive: true });
		expect(fetch).toHaveBeenCalledWith(`${baseUrl}/entries/?recursive=true`);
	});
	it('uses cookies and no authorization header on JSON writes', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
		await writeJson('/entries/test.json', { name: 'Test' });
		expect(fetch).toHaveBeenCalledWith(`${baseUrl}/entries/test.json`, {
			method: 'PUT',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test' }, undefined, 4)
		});
	});
	it.each([401, 403])(
		'preserves structured %s errors without retrying the mutation',
		async (status) => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: false,
					status,
					json: async () => ({ code: 'DENIED', message: 'Access denied' })
				})
			);
			await expect(writeFile('entries/test.json', '{}')).rejects.toMatchObject({
				status,
				code: 'DENIED',
				message: 'Access denied'
			});
			expect(auth.handleRejection).toHaveBeenCalledWith(status);
			expect(fetch).toHaveBeenCalledOnce();
		}
	);
	it('sends cookies with delete and encoded move destinations', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
		await deleteFile('/entries/test.json');
		await renameFile('/entries/test.json', '/archive/my file.json');
		expect(fetch).toHaveBeenNthCalledWith(1, `${baseUrl}/entries/test.json`, {
			method: 'DELETE',
			credentials: 'include'
		});
		expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/entries/test.json`, {
			method: 'MOVE',
			credentials: 'include',
			headers: { Destination: 'archive%2Fmy%20file.json' }
		});
	});
	it('encodes public file path segments', () => {
		expect(fileUrl('europe/ötztal/my photo #1.jpg')).toBe(
			`${baseUrl}/europe/%C3%B6tztal/my%20photo%20%231.jpg`
		);
	});
});
