import type { ApiListEntry, ApiListOptions } from '$lib/types/api';

/**
 * Felslager API Client
 * Wraps all interactions with the Felslager file-system API.
 */

const BASE_URL = import.meta.env.VITE_FELSLAGER_URL || 'https://felslager.vorstieg.eu/api/fs';
const CRED_KEY = 'felslager_auth';

// --- Credential Management (sessionStorage) ---

export function setCredentials(user: string, pass: string): void {
	try {
		if (typeof window === 'undefined') return;
		const encoded = btoa(`${user}:${pass}`);
		window.sessionStorage.setItem(CRED_KEY, encoded);
	} catch (e) {
		console.error('Failed to store credentials:', e);
	}
}

export function getCredentials(): string | null {
	try {
		if (typeof window === 'undefined') return null;
		return window.sessionStorage.getItem(CRED_KEY);
	} catch {
		return null;
	}
}

export function hasCredentials(): boolean {
	return !!getCredentials();
}

export function clearCredentials(): void {
	try {
		if (typeof window === 'undefined') return;
		window.sessionStorage.removeItem(CRED_KEY);
	} catch {
		// ignore
	}
}

// --- Internal Helpers ---

function authHeaders(): Record<string, string> {
	const cred = getCredentials();
	if (!cred) return {};
	return { Authorization: `Basic ${cred}` };
}

function isAuthRejected(res: Response): boolean {
	return res.status === 401 || res.status === 403;
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
	const headers = { ...authHeaders() };
	if (contentType) headers['Content-Type'] = contentType;
	const url = `${BASE_URL}/${normalizePath(path)}`;
	let res: Response;
	try {
		res = await fetch(url, { method: 'PUT', headers, body });
	} catch (err) {
		console.error(`Failed to write ${path}: request failed`, err);
		throw err;
	}
	if (!res.ok) {
		if (isAuthRejected(res)) clearCredentials();
		const text = await res.text().catch(() => '');
		const message = `Failed to write ${path}: ${res.status} ${res.statusText}${text ? ' - ' + text : ''}`;
		console.error(message);
		throw new Error(message);
	}
	return res;
}

export async function writeJson(path: string, data: unknown): Promise<Response> {
	const jsonString = JSON.stringify(data, undefined, 4);
	return writeFile(path, jsonString, 'application/json');
}

export async function deleteFile(path: string): Promise<Response> {
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
	if (!res.ok) {
		if (isAuthRejected(res)) clearCredentials();
		throw new Error(`Failed to delete ${path}: ${res.status} ${res.statusText}`);
	}
	return res;
}

export async function renameFile(oldPath: string, newPath: string): Promise<Response> {
	const url = `${BASE_URL}/${normalizePath(oldPath)}`;
	const headers = {
		...authHeaders(),
		Destination: encodeURIComponent(normalizePath(newPath))
	};
	const res = await fetch(url, { method: 'MOVE', headers });
	if (!res.ok) {
		if (isAuthRejected(res)) clearCredentials();
		throw new Error(`Failed to rename ${oldPath}: ${res.status} ${res.statusText}`);
	}
	return res;
}

export function fileUrl(path: string): string {
	return `${BASE_URL}/${normalizePath(path)}`;
}
