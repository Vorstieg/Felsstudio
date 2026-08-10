import { getContext, setContext } from 'svelte';

export const CRAG_EDITOR_SESSION = Symbol('crag-editor-session');

export function provideCragEditorSession(session) {
	setContext(CRAG_EDITOR_SESSION, session);
	return session;
}

export function getCragEditorSession() {
	const session = getContext(CRAG_EDITOR_SESSION);
	if (!session) throw new Error('Crag editor session is not available in this component tree');
	return session;
}

export function createInitialCrag() {
	const date = new Date().toISOString().split('T')[0];
	return {
		id: '',
		name: '',
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

export function createInitialAccess() {
	return { type: 'FeatureCollection', version: 1, features: [] };
}

export function normalizeCragSector(sector = {}) {
	return {
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

export function createCragEditorSession() {
	const snapshot = (session) =>
		JSON.parse(
			JSON.stringify({
				crag: session.crag,
				access: session.access,
				routeDocuments: session.routeDocuments
			})
		);
	const session = $state({
		crag: createInitialCrag(),
		access: createInitialAccess(),
		routeDocuments: [],
		selectedRouteKey: null,
		history: { entries: [], index: -1 },
		commit(label, mutator) {
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
		restoreSnapshot(value) {
			this.crag = value.crag;
			this.access = value.access;
			this.routeDocuments = value.routeDocuments;
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
			this.selectedRouteKey = null;
			this.history = { entries: [], index: -1 };
		},
		markDocumentDirty(path) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (document) document.dirty = true;
			return document;
		},
		setCragGeometry(geometry) {
			this.commit('Move crag', () => {
				this.crag.geometry = geometry;
			});
		},
		setCragField(field, value) {
			this.commit(`Update crag ${field}`, () => {
				this.crag[field] = value;
			});
		},
		setEquipment(equipment) {
			this.commit('Update equipment', () => {
				this.crag.equipment = equipment;
			});
		},
		setCragImages(images) {
			this.commit('Update crag images', () => {
				this.crag.assets = { ...(this.crag.assets || {}), images };
			});
		},
		setSectors(sectors) {
			this.commit('Update sectors', () => {
				this.crag.sectors = (sectors || []).map((sector) => normalizeCragSector(sector));
			});
		},
		updateSector(id, field, value) {
			this.commit(`Update sector ${field}`, () => {
				const sector = this.crag.sectors.find((item) => item.id === id);
				if (sector) sector[field] = value;
			});
		},
		updateEquipmentItem(index, field, value) {
			this.commit(`Update equipment ${field}`, () => {
				const item = this.crag.equipment[index];
				if (item) item[field] = value;
			});
		},
		replaceAccessFeatures(features) {
			this.commit('Update access features', () => {
				this.access = { ...this.access, features };
			});
		},
		addRouteDocument(document) {
			this.commit('Add route document', () => {
				this.routeDocuments = [...this.routeDocuments, document];
			});
			return document;
		},
		updateRouteDocument(path, updater) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (!document) return null;
			this.commit('Update route document', () => {
				updater(document.data, document);
				document.dirty = true;
			});
			return document;
		},
		updateRoute(path, routeId, updater) {
			return this.updateRouteDocument(path, (data) => {
				const route = (data.routes || []).find((entry) => String(entry.id) === String(routeId));
				if (route) updater(route);
			});
		},
		setDocumentClean(path) {
			const document = this.routeDocuments.find((entry) => entry.path === path);
			if (document) document.dirty = false;
			return document;
		},
		getSaveSession() {
			return { crag: this.crag, access: this.access };
		}
	});
	return session;
}
