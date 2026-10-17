import type { ApiListEntry, ApiListOptions } from '$lib/types/api';

/**
 * Felslager API Client
 * Wraps all interactions with the Felslager file-system API.
 */

const BASE_URL = import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs';
async function rejectMutation(res: Response): Promise<never> {
	const { authState } = await import('./auth.svelte.ts');
	if (res.status === 401 || res.status === 403) authState.handleRejection(res.status);
	const data = await res.json().catch(() => ({}));
	throw Object.assign(new Error(data.message || data.error || `Request failed (${res.status})`), {
		status: res.status,
		code: data.code || 'REQUEST_FAILED'
	});
}

function normalizePath(path: string): string {
	return path.replace(/^\/+/, '').replace(/\/+/g, '/');
}

// --- Public API ---

export async function listDir(
	path: string,
	{ recursive = false }: ApiListOptions = {}
): Promise<ApiListEntry[]> {
	const url = `${BASE_URL}/${normalizePath(path)}${recursive ? '?recursive=true' : ''}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to list ${path}: ${res.status} ${res.statusText}`);
	return res.json() as Promise<ApiListEntry[]>;
}

export async function readFile(path: string): Promise<Response> {
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status} ${res.statusText}`);
	return res;
}

export async function readJson<T = unknown>(path: string): Promise<T> {
	const res = await readFile(path);
	return res.json() as Promise<T>;
}

export async function writeFile(
	path: string,
	body: Blob | ArrayBuffer | string,
	contentType?: string
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (contentType) headers['Content-Type'] = contentType;
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url, { method: 'PUT', headers, body, credentials: 'include' });
	if (!res.ok) await rejectMutation(res);
	return res;
}

export async function writeJson(path: string, data: unknown): Promise<Response> {
	const jsonString = JSON.stringify(data, undefined, 4);
	return writeFile(path, jsonString, 'application/json');
}

export async function deleteFile(path: string): Promise<Response> {
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
	if (!res.ok) await rejectMutation(res);
	return res;
}

export async function renameFile(oldPath: string, newPath: string): Promise<Response> {
	const url = `${BASE_URL}/${normalizePath(oldPath)}`;
	const headers = {
		Destination: encodeURIComponent(normalizePath(newPath))
	};
	const res = await fetch(url, { method: 'MOVE', headers, credentials: 'include' });
	if (!res.ok) await rejectMutation(res);
	return res;
}

export function fileUrl(path: string): string {
	const encodedPath = normalizePath(path)
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	return `${BASE_URL}/${encodedPath}`;
}
