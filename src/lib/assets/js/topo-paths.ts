import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.ts';

export class Topo {
	constructor(
		readonly path: string,
		readonly cragId: string
	) {}

	_getPath(): string {
		return `${this.path}/${this.cragId}/${this.cragId}`;
	}

	getTopoPath(): string {
		return `${this._getPath()}-topo.json`;
	}

	getGlbPath(): string {
		return `${this._getPath()}.glb`;
	}

	getCragPath(): string {
		return `${this.path}/${this.cragId}/${this.cragId}.json`;
	}

	getBaseName(): string {
		return this.cragId;
	}

	getFileName(): string {
		return this.getBaseName() + '.json';
	}
	getAccessPath(): string {
		return `${this._getPath()}-access.json`;
	}
	getImagePath(name: string, token: string | number = ''): string {
		const lastDot = name.lastIndexOf('.');
		let ext = '';
		let baseName = name;
		if (lastDot > 0) {
			ext = name.substring(lastDot).toLowerCase();
			baseName = name.substring(0, lastDot);
		}
		const slug = slugifyName(baseName) || 'img';
		const suffix = token === '' || token === 0 ? '' : `-${token}`;
		return `${this._getPath()}-image${suffix}-${slug}${ext}`;
	}
}
