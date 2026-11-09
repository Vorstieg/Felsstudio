import { authState } from './auth.svelte';

const API = (
	import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs'
).replace(/\/fs\/?$/, '');
export type ReconstructionEngine = 'odm' | 'meshroom' | 'realityscan';
export type ProcessingStep = 'preparing' | 'reconstructing' | 'detecting' | 'positioning';
export type OptionValue = string | number | null | string[];
export type ProcessingOptions = Partial<Record<ProcessingStep, Record<string, OptionValue>>>;
export type ProcessingControl = {
	type: 'number' | 'integer' | 'string' | 'array';
	default: OptionValue;
	label: string;
	description?: string;
	unit?: string;
	minimum?: number;
	maximum?: number;
	enum?: (string | number)[];
	nullable?: boolean;
	advanced?: boolean;
	engines?: ReconstructionEngine[];
	when?: Record<string, OptionValue>;
	experimentalValues?: (string | number)[];
	advancedValues?: (string | number)[];
};
export type ProcessingControls = { version: number } & Record<
	ProcessingStep,
	Record<string, ProcessingControl>
>;
export type RestartOptions = {
	fromStep: ProcessingStep;
	options?: ProcessingOptions;
	engine?: ReconstructionEngine;
	runBoltDetection?: boolean;
	boltPlacementMethod?: BoltPlacementMethod;
	name?: string;
};
export type BoltPlacementMethod = 'triangle' | 'vertex' | 'multiview';
export type CaptureFile = { path: string; bytes: number };
export type Capture = {
	id: string;
	name: string;
	entryPath: string;
	createdAt: string;
	totalBytes: number;
	imageCount: number;
	uploadedCount?: number;
	files?: CaptureFile[];
	activeJobIds?: string[];
};
export type ProcessingRun = {
	id: string;
	name: string;
	sourceProcessingId?: string;
	startStep?: ProcessingStep;
	availableStartSteps?: ProcessingStep[];
	captureId: string;
	entryPath: string;
	engine: ReconstructionEngine;
	runBoltDetection: boolean;
	boltPlacementMethod?: BoltPlacementMethod;
	options?: ProcessingOptions;
	optionsVersion?: number;
	status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
	phase: string;
	stage: string;
	progress: number;
	stageCurrent?: number;
	stageTotal?: number;
	createdAt: string;
	cancelRequested?: boolean;
	error?: string;
};
export type ResultManifest = {
	processingId: string;
	captureId: string;
	entryPath: string;
	engine: ReconstructionEngine;
	runBoltDetection: boolean;
	boltPlacementMethod?: BoltPlacementMethod;
	options?: ProcessingOptions;
	optionsVersion?: number;
	files: { path: string; url: string }[];
};
async function request(path: string, init: RequestInit = {}) {
	const response = await fetch(`${API}${path}`, { ...init, credentials: 'include' });
	if (!response.ok) {
		if ([401, 403].includes(response.status)) authState.handleRejection(response.status);
		const data = await response.json().catch(() => ({}));
		throw Object.assign(
			new Error(data.message || data.code || `Request failed (${response.status})`),
			{ code: data.code, status: response.status }
		);
	}
	return response;
}
const json = async <T>(path: string, init?: RequestInit): Promise<T> =>
	(await request(path, init)).json();
const post = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});
const idPath = (kind: string, id: string) => `/${kind}/${encodeURIComponent(id)}`;
const filter = (entryPath?: string) =>
	entryPath ? `?entryPath=${encodeURIComponent(entryPath)}` : '';
export const listCaptures = (entryPath?: string) =>
	json<Capture[]>(`/captures${filter(entryPath)}`);
export const getCapture = (id: string) => json<Capture>(idPath('captures', id));
export const createCapture = (entryPath: string, name: string) =>
	json<Capture>('/captures', post({ entryPath, name }));
export const uploadCaptureFile = (id: string, path: string, file: File) =>
	json<CaptureFile>(`${idPath('captures', id)}/files?path=${encodeURIComponent(path)}`, {
		method: 'PUT',
		headers: { 'Content-Type': file.type || 'application/octet-stream' },
		body: file
	});
export const downloadCaptureFile = async (id: string, path: string) =>
	(await request(`${idPath('captures', id)}/files?path=${encodeURIComponent(path)}`)).blob();
export const deleteCapture = async (id: string) => {
	await request(idPath('captures', id), { method: 'DELETE' });
};
export const listProcessing = (entryPath?: string) =>
	json<ProcessingRun[]>(`/processing${filter(entryPath)}`);
export const getProcessingControls = () => json<ProcessingControls>('/processing/options');
export const getProcessing = (id: string) => json<ProcessingRun>(idPath('processing', id));
export const startProcessing = (
	captureId: string,
	engine: ReconstructionEngine,
	runBoltDetection: boolean,
	name?: string,
	boltPlacementMethod: BoltPlacementMethod = 'triangle',
	options?: ProcessingOptions
) =>
	json<ProcessingRun>(
		'/processing',
		post({
			captureId,
			engine,
			runBoltDetection,
			name,
			...(options ? { options } : { boltPlacementMethod })
		})
	);
export const restartProcessing = (id: string, options: RestartOptions) =>
	json<ProcessingRun>(`${idPath('processing', id)}/runs`, post(options));
export const cancelProcessing = (id: string) =>
	json<ProcessingRun>(`${idPath('processing', id)}/cancel`, { method: 'POST' });
export const deleteProcessing = async (id: string) => {
	await request(idPath('processing', id), { method: 'DELETE' });
};
export const getProcessingResults = (id: string) =>
	json<ResultManifest>(`${idPath('processing', id)}/results`);
// Construct URLs from manifest paths so credentials never follow an arbitrary manifest URL.
export const downloadResultFile = async (id: string, path: string) =>
	(
		await request(`${idPath('processing', id)}/results/files?path=${encodeURIComponent(path)}`)
	).blob();
