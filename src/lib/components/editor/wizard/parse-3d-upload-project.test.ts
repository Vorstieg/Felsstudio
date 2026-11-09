import { describe, expect, it } from 'vitest';
import {
	getUploadCameraPositions,
	getUploadModelTransform,
	parse3DUploadProject
} from './parse-3d-upload-project.ts';

const hit = {
	pos: [1, 2, 3],
	cam_pos: [4, 5, 6],
	conf: 0.8,
	class: 'bolt',
	img: 'F12.jpg',
	hit_crop: 'crop.jpg'
};

describe('parse3DUploadProject', () => {
	it('normalizes valid hits and GPS entries', () => {
		const project = parse3DUploadProject({
			name: 'Wall',
			hits: [hit],
			gps: [{ frame_index: 12, latitude: 47.1, longitude: 13.2, abs_alt: 1200 }]
		});
		expect(project.hits[0]).toMatchObject({
			crop: 'crop.jpg',
			edge_dist: 0,
			normal_dot: 1,
			cam_dist: 1
		});
		expect(project.gps[0]).toMatchObject({ frame_index: 12, latitude: 47.1, longitude: 13.2 });
	});

	it('accepts a project without detection data', () => {
		expect(parse3DUploadProject({ name: 'Wall' })).toEqual({ name: 'Wall', hits: [], gps: [] });
	});

	it('rejects malformed data before it enters clustering state', () => {
		expect(() => parse3DUploadProject({ hits: [{ ...hit, cam_pos: [1, 'bad', 3] }] })).toThrow(
			'Hit 1 needs pos, cam_pos, conf, class, and img'
		);
		expect(() => parse3DUploadProject({ gps: [{ latitude: 47.1 }] })).toThrow(
			'GPS entry 1 needs numeric latitude and longitude'
		);
		expect(() => parse3DUploadProject({ hits: [{ ...hit, gps: ['bad', 13, 1000] }] })).toThrow(
			'Hit 1 gps must be a three-number position'
		);
	});
});

it('imports standalone cameras and legacy observations including frame zero', () => {
	const project = parse3DUploadProject({
		cameras: { 'F0.jpg': [0, 0, 0], 'folder/photo.jpg': [1, 2, 3] },
		hits: [hit]
	});
	expect(getUploadCameraPositions(project)).toEqual({
		'0': [0, 0, 0],
		'folder/photo.jpg': [1, 2, 3],
		'12': [4, 5, 6]
	});
	expect(getUploadCameraPositions(parse3DUploadProject({ cameras: project.cameras }))).toEqual({
		'0': [0, 0, 0],
		'folder/photo.jpg': [1, 2, 3]
	});
	expect(() => parse3DUploadProject({ cameras: { photo: [1, 'bad', 3] } })).toThrow(
		'Project cameras'
	);
});
it('converts Z-up model orientation and centering together', () => {
	expect(
		getUploadModelTransform(parse3DUploadProject({ coordinateSystem: 'Z_UP' }), [-10, -20, -30])
	).toEqual({ modelRotation: [-Math.PI / 2, 0, 0], modelOffset: [-10, -30, 20] });
	expect(getUploadModelTransform(parse3DUploadProject({}), [-10, -20, -30])).toEqual({
		modelRotation: [0, 0, 0],
		modelOffset: [-10, -20, -30]
	});
	expect(() => parse3DUploadProject({ coordinateSystem: 'bad' })).toThrow('coordinateSystem');
});
