/**
 * Felslager API Client
 * Wraps all interactions with the Felslager file-system API.
 */

const BASE_URL = import.meta.env.VITE_FELSLAGER_URL || 'http://100.85.95.46:3001/api/fs';
const CRED_KEY = 'felslager_auth';

// --- Credential Management (sessionStorage) ---

/**
 * Store credentials in sessionStorage
 * @param {string} user
 * @param {string} pass
 */
export function setCredentials(user, pass) {
	try {
		if (typeof window === 'undefined') return;
		const encoded = btoa(`${user}:${pass}`);
		window.sessionStorage.setItem(CRED_KEY, encoded);
	} catch (e) {
		console.error('Failed to store credentials:', e);
	}
}

/**
 * Read the Base64-encoded credentials from sessionStorage
 * @returns {string|null}
 */
export function getCredentials() {
	try {
		if (typeof window === 'undefined') return null;
		return window.sessionStorage.getItem(CRED_KEY);
	} catch {
		return null;
	}
}

/**
 * Check if credentials are currently stored
 * @returns {boolean}
 */
export function hasCredentials() {
	return !!getCredentials();
}

/**
 * Remove stored credentials
 */
export function clearCredentials() {
	try {
		if (typeof window === 'undefined') return;
		window.sessionStorage.removeItem(CRED_KEY);
	} catch {
		// ignore
	}
}

// --- Internal Helpers ---

/**
 * Build the Authorization header if credentials exist
 * @returns {Record<string, string>}
 */
function authHeaders() {
	const cred = getCredentials();
	if (!cred) return {};
	return { Authorization: `Basic ${cred}` };
}

/**
 * Normalize a path (strip leading slash, ensure no double slashes)
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
	return path.replace(/^\/+/, '').replace(/\/+/g, '/');
}

// --- Public API ---

/**
 * List directory contents.
 * @param {string} path - Directory path relative to the API root (e.g. 'entries')
 * @param {{ recursive?: boolean }} [options]
 * @returns {Promise<Array<{ name: string, path: string, type: 'file' | 'dir' }>>}
 */
export async function listDir(path, { recursive = false } = {}) {
	const url = `${BASE_URL}/${normalizePath(path)}${recursive ? '?recursive=true' : ''}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to list ${path}: ${res.status} ${res.statusText}`);
	return res.json();
}

/**
 * Read a file and return the raw Response (for binary files, images, etc.)
 * @param {string} path - File path relative to the API root
 * @returns {Promise<Response>}
 */
export async function readFile(path) {
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status} ${res.statusText}`);
	return res;
}

/**
 * Read a JSON file and return the parsed object.
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function readJson(path) {
	const res = await readFile(path);
	return res.json();
}

/**
 * Write (upload/overwrite) a file. Requires authentication.
 * @param {string} path - Destination path relative to the API root
 * @param {Blob|ArrayBuffer|string} body - File content
 * @param {string} [contentType] - MIME type (auto-detected for Blobs)
 * @returns {Promise<Response>}
 */
export async function writeFile(path, body, contentType) {
	const headers = { ...authHeaders() };
	if (contentType) headers['Content-Type'] = contentType;
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url, { method: 'PUT', headers, body });
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Failed to write ${path}: ${res.status} ${res.statusText}${text ? ' - ' + text : ''}`);
	}
	return res;
}

/**
 * Write a JSON object to a file. Requires authentication.
 * @param {string} path
 * @param {any} data
 * @returns {Promise<Response>}
 */
export async function writeJson(path, data) {
	const jsonString = JSON.stringify(data, undefined, 4);
	return writeFile(path, jsonString, 'application/json');
}

/**
 * Delete a file or directory. Requires authentication.
 * @param {string} path
 * @returns {Promise<Response>}
 */
export async function deleteFile(path) {
	const url = `${BASE_URL}/${normalizePath(path)}`;
	const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
	if (!res.ok) throw new Error(`Failed to delete ${path}: ${res.status} ${res.statusText}`);
	return res;
}

/**
 * Build the full public URL for a file (for use in <img src>, model loaders, etc.)
 * @param {string} path - Path relative to the API root
 * @returns {string}
 */
export function fileUrl(path) {
	return `${BASE_URL}/${normalizePath(path)}`;
}
