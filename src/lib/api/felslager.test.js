import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearCredentials,
	deleteFile,
	fileUrl,
	getCredentials,
	listDir,
	renameFile,
	setCredentials,
	writeFile,
	writeJson
} from './felslager.js';

describe('Felslager API client', () => {
	beforeEach(() => {
		clearCredentials();
		vi.restoreAllMocks();
	});

	it('stores and clears session credentials', () => {
		setCredentials('alice', 'secret');
		expect(getCredentials()).toBe(btoa('alice:secret'));
		clearCredentials();
		expect(getCredentials()).toBeNull();
	});

	it('normalizes paths and adds recursive listing query parameters', async () => {
		const response = { ok: true, json: vi.fn().mockResolvedValue([{ name: 'a.json' }]) };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

		await expect(listDir('///entries//', { recursive: true })).resolves.toEqual([
			{ name: 'a.json' }
		]);
		expect(fetch).toHaveBeenCalledWith(
			'https://felslager.vorstieg.eu/api/fs/entries/?recursive=true'
		);
	});

	it('writes JSON with credentials and a content type', async () => {
		setCredentials('alice', 'secret');
		const response = { ok: true };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
		const data = { name: 'Test', routes: [] };

		await expect(writeJson('/entries/test.json', data)).resolves.toBe(response);
		expect(fetch).toHaveBeenCalledWith(
			'https://felslager.vorstieg.eu/api/fs/entries/test.json',
			expect.objectContaining({
				method: 'PUT',
				headers: {
					Authorization: `Basic ${btoa('alice:secret')}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(data, undefined, 4)
			})
		);
	});

	it('clears credentials when a write is rejected by authentication', async () => {
		setCredentials('alice', 'secret');
		const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				text: vi.fn().mockResolvedValue('expired')
			})
		);

		await expect(writeFile('entries/test.json', '{}')).rejects.toThrow(
			'Failed to write entries/test.json: 401 Unauthorized - expired'
		);
		expect(logError).toHaveBeenCalledWith(
			'Failed to write entries/test.json: 401 Unauthorized - expired'
		);
		expect(getCredentials()).toBeNull();
	});

	it('sends authenticated delete and encoded move destinations', async () => {
		setCredentials('alice', 'secret');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

		await deleteFile('/entries/test.json');
		await renameFile('/entries/test.json', '/archive/my file.json');

		expect(fetch).toHaveBeenNthCalledWith(
			1,
			'https://felslager.vorstieg.eu/api/fs/entries/test.json',
			expect.objectContaining({ method: 'DELETE' })
		);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			'https://felslager.vorstieg.eu/api/fs/entries/test.json',
			expect.objectContaining({
				method: 'MOVE',
				headers: expect.objectContaining({ Destination: 'archive%2Fmy%20file.json' })
			})
		);
	});

	it('builds public file URLs using the same path normalization', () => {
		expect(fileUrl('//images//wall.png')).toBe(
			'https://felslager.vorstieg.eu/api/fs/images/wall.png'
		);
	});
});
