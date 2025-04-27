import { SchemaEnricher } from '../src/SchemaEnricher';
import { JSONSchema7 } from 'json-schema';

describe('SchemaEnricher', () => {
  it('should enrich schema UI with metadata and merge JSONs', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };

    const schemaUI: Record<string, any> = {};

    const jsonArray = [
      { id: '1', name: 'Alice', age: 25 },
      { id: '2', name: 'Bob' },
      { id: '3', age: 30 },
    ];

    const schemaEnricher = new SchemaEnricher();
    const { schema: enrichedSchema, schemaUI: enrichedSchemaUI, mergedJson } = schemaEnricher.enrichSchema(
      schema,
      schemaUI,
      jsonArray
    );

    expect(mergedJson).toEqual({ id: '3', name: 'Bob', age: 30 });
    expect(enrichedSchemaUI).toEqual({
      'name': {
        widget: {
          sourceIds: ['2'],
          inheritedValue: 'Bob',
        },
      },
      'age': {
        widget: {
          sourceIds: ['3'],
          inheritedValue: 30,
        },
      },
    });
  });
});
