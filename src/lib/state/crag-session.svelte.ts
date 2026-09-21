import type { EntryKind, GeoJSONGeometry } from '@vorstieg/fels-data/types';
import type {
	AccessCollection,
	CragEditorSession,
	CragEditorSnapshot,
	CragHistoryEntry,
	CragSector,
	EditableCrag,
	HierarchyEntry,
	HierarchyValidationError,
	MetadataTarget,
	RouteDocument,
	SectorStorageMove
} from '$lib/types/crag';
import { getContext, setContext } from 'svelte';

export const CRAG_EDITOR_SESSION = Symbol('crag-editor-session');

export function provideCragEditorSession(session: CragEditorSession): CragEditorSession {
	setContext(CRAG_EDITOR_SESSION, session);
	return session;
}

export function getCragEditorSession(): CragEditorSession {
	const session = getContext<CragEditorSession>(CRAG_EDITOR_SESSION);
	if (!session) throw new Error('Crag editor session is not available in this component tree');
	return session;
}

export function createInitialCrag(): EditableCrag {
	const date = new Date().toISOString().split('T')[0];
	return {
		id: '',
		name: '',
		kind: 'crag',
		path: '',
		type: ['sports-climbing'],
		tags: [],
		security: '',
		rock_type: '',
		description_de: '',
		description_en: '',
		equipment: [],
		assets: { images: [] },
		sectors: [],
		topo: { site: '', link: '' },
		geometry: { type: 'Point', coordinates: [16.37, 48.21] },
		date,
		updated: date
	};
}

export function createInitialAccess(): AccessCollection {
	return { type: 'FeatureCollection', version: 1, features: [] };
}

export function normalizeCragSector(sector: Partial<CragSector> = {}): CragSector {
	return {
		id: sector.id ?? '',
		name: sector.name ?? '',
		kind: 'sector',
		...sector,
		type: Array.isArray(sector.type) ? sector.type : [],
		tags: Array.isArray(sector.tags) ? sector.tags : [],
		topo: { site: '', link: '', ...(sector.topo || {}) },
		assets: {
			topos: [],
			images: [],
			models: [],
			approaches: [],
			...(sector.assets || {})
		}
	};
}

function cloneSnapshot(value: CragEditorSnapshot): CragEditorSnapshot {
	return JSON.parse(JSON.stringify(value)) as CragEditorSnapshot;
}

export const HIERARCHY_KINDS = ['country', 'region', 'area', 'crag', 'sector'] as const;

const hierarchyRank = (kind: unknown) => HIERARCHY_KINDS.indexOf(kind as never);

export function validateHierarchy(entries: HierarchyEntry[]): HierarchyValidationError[] {
	const errors: HierarchyValidationError[] = [];
	const byKey = new Map(entries.map((entry) => [entry.key, entry]));
	for (const entry of entries) {
		const kind = entry.feature.kind as EntryKind;
		const rank = hierarchyRank(kind);
		if (rank < 0) {
			errors.push({ key: entry.key, kind, message: `Unknown kind “${kind}”.` });
			continue;
		}
		const parent = entry.parentKey ? byKey.get(entry.parentKey) : null;
		if (parent && hierarchyRank(parent.feature.kind) > rank) {
			errors.push({
				key: entry.key,
				kind,
				message: `${entry.feature.name || entry.feature.id} must be at least as specific as its parent (${parent.feature.kind}).`
			});
		}
		for (const childKey of entry.childKeys) {
			const child = byKey.get(childKey);
			if (child && hierarchyRank(child.feature.kind) < rank) {
				errors.push({
					key: entry.key,
					kind,
					message: `${entry.feature.name || entry.feature.id} cannot be more specific than its child (${child.feature.kind}).`
				});
			}
		}
		for (const child of entry.feature.sectors || []) {
			const childRank = hierarchyRank(child.kind || 'sector');
			if (childRank >= 0 && childRank < rank) {
				errors.push({
					key: entry.key,
					kind,
					message: `${entry.feature.name || entry.feature.id} cannot be more specific than its child (${child.kind}).`
				});
			}
		}
	}
	return errors;
}

export function createCragEditorSession(): CragEditorSession {
	const snapshot = (session: CragEditorSession): CragEditorSnapshot =>
		cloneSnapshot({
			crag: session.crag,
			access: session.access,
			routeDocuments: session.routeDocuments,
			sectorStorageMoves: session.sectorStorageMoves,
			sourceCrag: session.sourceCrag,
			hierarchyEntries: session.hierarchyEntries,
			activeMetadataTarget: session.activeMetadataTarget
		});

	const session = $state({
		crag: createInitialCrag(),
		access: createInitialAccess(),
		routeDocuments: [] as RouteDocument[],
		sectorStorageMoves: [] as SectorStorageMove[],
		sourceCrag: null as CragEditorSession['sourceCrag'],
		hierarchyEntries: [] as HierarchyEntry[],
		activeMetadataTarget: null as MetadataTarget | null,
		selectedRouteKey: null as string | null,
		history: { entries: [] as CragHistoryEntry[], index: -1 },
		commit(label: string, mutator: () => void) {
			const before = snapshot(this);
			mutator();
			const after = snapshot(this);
			if (JSON.stringify(before) === JSON.stringify(after)) return false;
			if (this.history.index < this.history.entries.length - 1) {
				this.history.entries = this.history.entries.slice(0, this.history.index + 1);
			}
			this.history.entries.push({ label, before, after });
			if (this.history.entries.length > 50) this.history.entries.shift();
			this.history.index = this.history.entries.length - 1;
			return true;
		},
		restoreSnapshot(value: CragEditorSnapshot) {
			this.crag = value.crag;
			this.access = value.access;
			this.routeDocuments = value.routeDocuments;
			this.sectorStorageMoves = value.sectorStorageMoves || [];
			this.sourceCrag = value.sourceCrag || this.sourceCrag;
			this.hierarchyEntries = value.hierarchyEntries || [];
			this.activeMetadataTarget = value.activeMetadataTarget || null;
			const current = this.hierarchyEntries.find((entry) => entry.isCurrent);
			if (current) current.feature = this.crag;
		},
		undo() {
			if (session.history.index < 0) return false;
			const entry = session.history.entries[session.history.index];
			session.restoreSnapshot(entry.before);
			session.history.index--;
			return true;
		},
		redo() {
			if (session.history.index >= session.history.entries.length - 1) return false;
			const entry = session.history.entries[session.history.index + 1];
			session.restoreSnapshot(entry.after);
			session.history.index++;
			return true;
		},
		get canUndo() {
			return this.history.index >= 0;
		},
		get canRedo() {
			return this.history.index < this.history.entries.length - 1;
		},
		reset() {
			this.crag = createInitialCrag();
			this.access = createInitialAccess();
			this.routeDocuments = [];
			this.sectorStorageMoves = [];
			this.sourceCrag = null;
			this.hierarchyEntries = [];
			this.activeMetadataTarget = null;
			this.selectedRouteKey = null;
			this.history = { entries: [], index: -1 };
		},
		markDocumentDirty(path: string) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (document) document.dirty = true;
			return document;
		},
		setCragGeometry(geometry: GeoJSONGeometry) {
			const current = this.hierarchyEntries.find((entry) => entry.isCurrent);
			this.commitGeometry(
				current ? { type: 'entry', key: current.key } : null,
				geometry,
				'Move crag'
			);
		},
		commitGeometry(target: MetadataTarget | null, geometry: GeoJSONGeometry, label: string) {
			return this.commit(label, () => {
				const metadata = target ? this.getMetadataTarget(target) : this.crag;
				if (!metadata) return;
				metadata.geometry = geometry;
				const owner =
					target?.type === 'entry'
						? this.hierarchyEntries.find((entry) => entry.key === target.key)
						: this.hierarchyEntries.find((entry) => entry.isCurrent);
				if (owner) owner.dirty = true;
			});
		},
		getMetadataTarget(target?: MetadataTarget | null) {
			target = target ?? this.activeMetadataTarget;
			if (!target) return this.crag;
			if (target.type === 'sector')
				return this.crag.sectors.find((item) => item.id === target.id) || null;
			return this.hierarchyEntries.find((entry) => entry.key === target.key)?.feature || null;
		},
		setActiveMetadataTarget(target: MetadataTarget | null) {
			this.activeMetadataTarget = target;
		},
		setMetadataField(field: string, value: unknown, target?: MetadataTarget | null) {
			target = target ?? this.activeMetadataTarget;
			this.commit(`Update metadata ${field}`, () => {
				const metadata = this.getMetadataTarget(target);
				if (!metadata) return;
				const oldId = metadata.id;
				metadata[field] = value;
				if (target?.type === 'sector' && field === 'id' && oldId !== String(value)) {
					const oldPrefix = `${this.crag.path}/${this.crag.id}/${oldId}/${oldId}`.replace(/^\/+/, '');
					const newPrefix = `${this.crag.path}/${this.crag.id}/${value}/${value}`.replace(/^\/+/, '');
					metadata.assets = Object.fromEntries(
						Object.entries(metadata.assets || {}).map(([key, assets]) => [
							key,
							Array.isArray(assets)
								? assets.map((asset) =>
										asset?.path?.startsWith(oldPrefix)
											? { ...asset, path: `${newPrefix}${asset.path.slice(oldPrefix.length)}` }
											: asset
									)
								: assets
						])
					);
					const previousMove = this.sectorStorageMoves.find((move) => move.to === oldId);
					if (previousMove) previousMove.to = String(value);
					else this.sectorStorageMoves.push({ from: String(oldId), to: String(value) });
					for (const document of this.routeDocuments)
						if (document.sectorId === oldId) {
							document.sectorId = String(value);
							document.path =
								`${this.crag.path}/${this.crag.id}/${value}/${value}-topo.json`.replace(/^\/+/, '');
							if (document.data) document.data.sector_id = String(value);
							document.dirty = true;
						}
					this.activeMetadataTarget = { type: 'sector', id: String(value) };
				}
				const entry =
					target?.type === 'entry'
						? this.hierarchyEntries.find((item) => item.key === target.key)
						: this.hierarchyEntries.find((item) => item.isCurrent);
				if (entry) entry.dirty = true;
				if (entry && ['id', 'name', 'kind'].includes(field)) {
					const parent = entry.parentKey
						? this.hierarchyEntries.find((item) => item.key === entry.parentKey)
						: null;
					const summary = parent?.feature.sectors?.find((item) => item.id === oldId);
					if (summary) {
						summary.id = String(metadata.id || '');
						summary.name = String(metadata.name || '');
						summary.kind = metadata.kind as EntryKind;
						parent!.dirty = true;
					}
				}
			});
		},
		setMetadataEquipment(equipment: unknown[], target?: MetadataTarget | null) {
			target = target ?? this.activeMetadataTarget;
			this.commit('Update metadata equipment', () => {
				const metadata = this.getMetadataTarget(target);
				if (metadata) metadata.equipment = equipment;
				const entry =
					target?.type === 'entry'
						? this.hierarchyEntries.find((item) => item.key === target.key)
						: this.hierarchyEntries.find((item) => item.isCurrent);
				if (entry) entry.dirty = true;
			});
		},
		setMetadataImages(images: unknown[], target?: MetadataTarget | null) {
			target = target ?? this.activeMetadataTarget;
			this.commit('Update metadata images', () => {
				const metadata = this.getMetadataTarget(target);
				if (metadata) metadata.assets = { ...(metadata.assets || {}), images };
				const entry =
					target?.type === 'entry'
						? this.hierarchyEntries.find((item) => item.key === target.key)
						: this.hierarchyEntries.find((item) => item.isCurrent);
				if (entry) entry.dirty = true;
			});
		},
		updateMetadataEquipmentItem(
			index: number,
			field: string,
			value: unknown,
			target?: MetadataTarget | null
		) {
			target = target ?? this.activeMetadataTarget;
			const equipment = [
				...((this.getMetadataTarget(target)?.equipment || []) as Record<string, unknown>[])
			];
			if (!equipment[index]) return;
			equipment[index] = { ...equipment[index], [field]: value };
			this.setMetadataEquipment(equipment, target);
		},
		markHierarchyEntryClean(key: string) {
			const entry = this.hierarchyEntries.find((item) => item.key === key);
			if (entry) entry.dirty = false;
		},
		get hierarchyErrors() {
			return validateHierarchy(this.hierarchyEntries);
		},
		setCragField(field: string, value: unknown) {
			this.setMetadataField(
				field,
				value,
				this.hierarchyEntries.find((entry) => entry.isCurrent)
					? { type: 'entry', key: this.hierarchyEntries.find((entry) => entry.isCurrent)!.key }
					: null
			);
		},
		setEquipment(equipment: unknown[]) {
			this.setMetadataEquipment(
				equipment,
				this.hierarchyEntries.find((entry) => entry.isCurrent)
					? { type: 'entry', key: this.hierarchyEntries.find((entry) => entry.isCurrent)!.key }
					: null
			);
		},
		setCragImages(images: unknown[]) {
			this.setMetadataImages(
				images,
				this.hierarchyEntries.find((entry) => entry.isCurrent)
					? { type: 'entry', key: this.hierarchyEntries.find((entry) => entry.isCurrent)!.key }
					: null
			);
		},
		setSectors(sectors: CragSector[]) {
			this.commit('Update sectors', () => {
				this.crag.sectors = (sectors || []).map((sector) => normalizeCragSector(sector));
				const current = this.hierarchyEntries.find((entry) => entry.isCurrent);
				if (current) current.dirty = true;
			});
		},
		updateSector(id: string, field: string, value: unknown) {
			this.commit(`Update sector ${field}`, () => {
				const sector = this.crag.sectors.find((item) => item.id === id);
				if (sector) sector[field] = value;
				const current = this.hierarchyEntries.find((entry) => entry.isCurrent);
				if (current) current.dirty = true;
			});
		},
		updateEquipmentItem(index: number, field: string, value: unknown) {
			this.updateMetadataEquipmentItem(
				index,
				field,
				value,
				this.hierarchyEntries.find((entry) => entry.isCurrent)
					? { type: 'entry', key: this.hierarchyEntries.find((entry) => entry.isCurrent)!.key }
					: null
			);
		},
		replaceAccessFeatures(features: unknown[]) {
			this.commit('Update access features', () => {
				this.access = { ...this.access, features };
				const current = this.hierarchyEntries.find((entry) => entry.isCurrent);
				if (current) current.dirty = true;
			});
		},
		addRouteDocument(document: RouteDocument) {
			this.commit('Add route document', () => {
				this.routeDocuments = [...this.routeDocuments, document];
			});
			return document;
		},
		updateRouteDocument(
			path: string,
			updater: (data: RouteDocument['data'], document: RouteDocument) => void
		) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (!document) return null;
			this.commit('Update route document', () => {
				updater(document.data, document);
				document.dirty = true;
			});
			return document;
		},
		updateRoute(
			path: string,
			routeId: string | number,
			updater: (route: RouteDocument['data']['routes'][number]) => void
		) {
			return this.updateRouteDocument(path, (data) => {
				const route = (data.routes || []).find((entry) => String(entry.id) === String(routeId));
				if (route) updater(route);
			});
		},
		setDocumentClean(path: string) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (document) document.dirty = false;
			return document;
		},
		getSaveSession() {
			return {
				crag: this.crag,
				access: this.access,
				hierarchyEntries: this.hierarchyEntries,
				activeMetadataTarget: this.activeMetadataTarget
			};
		}
	}) as CragEditorSession;
	return session;
}
