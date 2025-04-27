import { SchemaTraverser, SchemaTraversalContext, DataTraversalContext } from '@src/SchemaTraverser';
import { JsonSchema } from '@src/types';

describe('SchemaTraverser', () => {
  let traverser: SchemaTraverser;

  beforeEach(() => {
    traverser = new SchemaTraverser();
  });

  // --- traverseSchema Tests ---
  describe('traverseSchema', () => {
    test('should traverse a simple object schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const visitedPaths: string[] = [];
      const callback = jest.fn((context: SchemaTraversalContext) => {
        visitedPaths.push(context.path.join('.'));
      });

      traverser.traverseSchema(schema, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root, name, age
      expect(visitedPaths).toContain(''); // Root
      expect(visitedPaths).toContain('name');
      expect(visitedPaths).toContain('age');
    });

    test('should traverse nested object schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
            },
          },
        },
      };
      const visitedPaths: string[] = [];
      const callback = jest.fn((context: SchemaTraversalContext) => {
        visitedPaths.push(context.path.join('.'));
      });

      traverser.traverseSchema(schema, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root, user, user.id
      expect(visitedPaths).toContain('');
      expect(visitedPaths).toContain('user');
      expect(visitedPaths).toContain('user.id');
    });

    test('should traverse array schema (single item type)', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const visitedPaths: string[] = [];
      const callback = jest.fn((context: SchemaTraversalContext) => {
        visitedPaths.push(context.path.join('.'));
      });

      traverser.traverseSchema(schema, callback);

      expect(callback).toHaveBeenCalledTimes(2); // Root array, items schema
      expect(visitedPaths).toContain(''); // Path points to the array itself
      expect(visitedPaths).toContain(''); // Path for items schema is also the array's path
    });

    test('should traverse tuple schema (array item types)', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: [
          { type: 'number' },
          { type: 'string' },
        ],
      };
      const visitedContexts: SchemaTraversalContext[] = [];
      const callback = jest.fn((context: SchemaTraversalContext) => {
        visitedContexts.push(context);
      });

      traverser.traverseSchema(schema, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root array, item[0], item[1]
      expect(visitedContexts.map(c => c.path.join('.'))).toEqual(['', '', '']); // Path is always the array path
      expect(visitedContexts.map(c => c.propertyName)).toEqual([undefined, '0', '1']); // propertyName indicates index
    });

    test('should traverse combiners (allOf, anyOf, oneOf)', () => {
      const schema: JsonSchema = {
        allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
        anyOf: [{ type: 'object', properties: { b: { type: 'number' } } }],
        oneOf: [{ type: 'boolean' }],
      };
      const visitedPaths: string[] = [];
      const callback = jest.fn((context: SchemaTraversalContext) => {
        visitedPaths.push(context.path.join('.'));
      });

      traverser.traverseSchema(schema, callback);

      // Root, allOf[0], allOf[0].properties.a, anyOf[0], anyOf[0].properties.b, oneOf[0]
      expect(callback).toHaveBeenCalledTimes(6);
      expect(visitedPaths).toEqual(['', '', 'a', '', 'b', '']);
    });

    test('should provide correct context (propertyName, parentSchemaNode)', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: { type: 'string' },
            },
          },
        },
      };
      const callback = jest.fn();

      traverser.traverseSchema(schema, callback);

      const rootCall = callback.mock.calls.find(call => call[0].path.length === 0);
      const level1Call = callback.mock.calls.find(call => call[0].path.join('.') === 'level1');
      const level2Call = callback.mock.calls.find(call => call[0].path.join('.') === 'level1.level2');

      expect(rootCall[0].propertyName).toBeUndefined();
      expect(rootCall[0].parentSchemaNode).toBeUndefined();

      expect(level1Call[0].propertyName).toBe('level1');
      expect(level1Call[0].parentSchemaNode).toBe(schema); // Parent is the root schema

      expect(level2Call[0].propertyName).toBe('level2');
      expect(level2Call[0].parentSchemaNode).toBe(schema.properties?.level1); // Parent is the level1 schema
    });
  });

  // --- traverseData Tests ---
  describe('traverseData', () => {
    test('should traverse simple object schema and data', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const data = { name: 'Test', age: 30 };
      const visitedContexts: DataTraversalContext[] = [];
      const callback = jest.fn((context: DataTraversalContext) => {
        visitedContexts.push({ ...context }); // Shallow copy context
      });

      traverser.traverseData(schema, data, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root, name, age

      const rootCtx = visitedContexts.find(c => c.path.length === 0);
      const nameCtx = visitedContexts.find(c => c.path.join('.') === 'name');
      const ageCtx = visitedContexts.find(c => c.path.join('.') === 'age');

      expect(rootCtx?.dataValue).toBe(data);
      expect(nameCtx?.dataValue).toBe('Test');
      expect(ageCtx?.dataValue).toBe(30);
    });

    test('should traverse nested object schema and data', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
            },
          },
        },
      };
      const data = { user: { id: 123 } };
      const visitedContexts: DataTraversalContext[] = [];
      const callback = jest.fn((context: DataTraversalContext) => {
        visitedContexts.push({ ...context });
      });

      traverser.traverseData(schema, data, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root, user, user.id

      const userCtx = visitedContexts.find(c => c.path.join('.') === 'user');
      const userIdCtx = visitedContexts.find(c => c.path.join('.') === 'user.id');

      expect(userCtx?.dataValue).toEqual({ id: 123 });
      expect(userIdCtx?.dataValue).toBe(123);
    });

    test('should traverse array schema and data', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const data = ['a', 'b'];
      const visitedContexts: DataTraversalContext[] = [];
      const callback = jest.fn((context: DataTraversalContext) => {
        visitedContexts.push({ ...context });
      });

      traverser.traverseData(schema, data, callback);

      // Root array, items schema for 'a', items schema for 'b'
      expect(callback).toHaveBeenCalledTimes(3);

      const rootCtx = visitedContexts.find(c => c.path.length === 0);
      const item0Ctx = visitedContexts.find(c => c.propertyName === '0');
      const item1Ctx = visitedContexts.find(c => c.propertyName === '1');

      expect(rootCtx?.dataValue).toBe(data);
      expect(item0Ctx?.dataValue).toBe('a');
      expect(item0Ctx?.schemaNode).toBe(schema.items);
      expect(item1Ctx?.dataValue).toBe('b');
      expect(item1Ctx?.schemaNode).toBe(schema.items);
    });

    test('should traverse tuple schema and data', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: [
          { type: 'number' },
          { type: 'string' },
        ],
      };
      const data = [10, 'hello'];
      const visitedContexts: DataTraversalContext[] = [];
      const callback = jest.fn((context: DataTraversalContext) => {
        visitedContexts.push({ ...context });
      });

      traverser.traverseData(schema, data, callback);

      // Root array, item[0] schema, item[1] schema
      expect(callback).toHaveBeenCalledTimes(3);

      const rootCtx = visitedContexts.find(c => c.path.length === 0);
      const item0Ctx = visitedContexts.find(c => c.propertyName === '0');
      const item1Ctx = visitedContexts.find(c => c.propertyName === '1');

      expect(rootCtx?.dataValue).toBe(data);
      expect(item0Ctx?.dataValue).toBe(10);
      expect(item0Ctx?.schemaNode).toBe((schema.items as JsonSchema[])[0]);
      expect(item1Ctx?.dataValue).toBe('hello');
      expect(item1Ctx?.schemaNode).toBe((schema.items as JsonSchema[])[1]);
    });

    test('should handle missing optional properties in data', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          requiredProp: { type: 'string' },
          optionalProp: { type: 'number' },
        },
        required: ['requiredProp'],
      };
      const data = { requiredProp: 'exists' };
      const visitedContexts: DataTraversalContext[] = [];
      const callback = jest.fn((context: DataTraversalContext) => {
        visitedContexts.push({ ...context });
      });

      traverser.traverseData(schema, data, callback);

      expect(callback).toHaveBeenCalledTimes(3); // Root, requiredProp, optionalProp

      const requiredCtx = visitedContexts.find(c => c.path.join('.') === 'requiredProp');
      const optionalCtx = visitedContexts.find(c => c.path.join('.') === 'optionalProp');

      expect(requiredCtx?.dataValue).toBe('exists');
      expect(optionalCtx?.dataValue).toBeUndefined(); // dataValue is undefined for missing prop
    });

    test('should handle data structure mismatch (e.g., array vs object)', () => {
        const schema: JsonSchema = {
          type: 'object',
          properties: {
            prop: { type: 'string' },
          },
        };
        const data = [1, 2, 3]; // Data is an array, schema expects object
        const callback = jest.fn();

        traverser.traverseData(schema, data, callback);

        // Callback should only be called for the root node
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ path: [], dataValue: data, schemaNode: schema }));
    });

    test('should traverse combiners with data', () => {
        const schema: JsonSchema = {
            allOf: [
                { properties: { a: { type: 'string' } } },
                { properties: { b: { type: 'number' } } },
            ]
        };
        const data = { a: 'test', b: 123 };
        const callback = jest.fn();

        traverser.traverseData(schema, data, callback);

        // Root, allOf[0], allOf[0].a, allOf[1], allOf[1].b
        expect(callback).toHaveBeenCalledTimes(5);

        // Check that dataValue is passed down correctly
        const allOf0Call = callback.mock.calls.find(call => call[0].schemaNode === schema.allOf?.[0]);
        const allOf1Call = callback.mock.calls.find(call => call[0].schemaNode === schema.allOf?.[1]);
        const propACall = callback.mock.calls.find(call => call[0].path.join('.') === 'a');
        const propBCall = callback.mock.calls.find(call => call[0].path.join('.') === 'b');

        expect(allOf0Call[0].dataValue).toBe(data);
        expect(allOf1Call[0].dataValue).toBe(data);
        expect(propACall[0].dataValue).toBe('test');
        expect(propBCall[0].dataValue).toBe(123);
    });

  });
});
