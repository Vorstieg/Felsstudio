import cragSchema from '../schemas/crag.schema.json' with { type: 'json' };
import sectorSchema from '../schemas/sector.schema.json' with { type: 'json' };
import topoSchema from '../schemas/topo.schema.json' with { type: 'json' };

/** Shared JSON Schemas for Felsstudio and Felsverzeichnis data files. */
export const schemas = Object.freeze({ crag: cragSchema, sector: sectorSchema, topo: topoSchema });

/** Package version of the shared data contract. */
export const dataFormatVersion = '0.1';

export { cragSchema, sectorSchema, topoSchema };
