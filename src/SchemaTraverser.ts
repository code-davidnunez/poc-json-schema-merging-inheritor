import _ from 'lodash';
import { JsonSchema, SchemaProperty } from './types';

export interface SchemaTraversalContext {
  schemaNode: SchemaProperty | JsonSchema;
  path: string[];
  propertyName?: string;
  parentSchemaNode?: SchemaProperty | JsonSchema;
}

export interface DataTraversalContext extends SchemaTraversalContext {
  dataValue: any;
}

export type SchemaTraversalCallback = (context: SchemaTraversalContext) => void;
export type DataTraversalCallback = (context: DataTraversalContext) => void;

// --- Handler Types ---
type SchemaRecursiveFn = (
  schemaNode: JsonSchema | SchemaProperty,
  currentPath: string[],
  callback: SchemaTraversalCallback,
  propertyName?: string,
  parentSchemaNode?: JsonSchema | SchemaProperty
) => void;

type DataRecursiveFn = (
  schemaNode: JsonSchema | SchemaProperty,
  dataValue: any,
  currentPath: string[],
  callback: DataTraversalCallback,
  propertyName?: string,
  parentSchemaNode?: JsonSchema | SchemaProperty
) => void;

type SchemaKeywordHandler = (
  node: any, // The current schema node being processed
  currentPath: string[],
  callback: SchemaTraversalCallback,
  parentSchemaNode: JsonSchema | SchemaProperty,
  traverse: SchemaRecursiveFn // Function to continue recursion
) => void;

type DataKeywordHandler = (
  node: any, // The current schema node being processed
  dataValue: any,
  currentPath: string[],
  callback: DataTraversalCallback,
  parentSchemaNode: JsonSchema | SchemaProperty,
  traverse: DataRecursiveFn // Function to continue recursion
) => void;

export class SchemaTraverser {
  private schemaKeywordHandlers: Record<string, SchemaKeywordHandler>;
  private dataKeywordHandlers: Record<string, DataKeywordHandler>;

  constructor() {
    this.schemaKeywordHandlers = {
      properties: this._handleSchemaProperties,
      items: this._handleSchemaItems,
      allOf: this._handleSchemaCombiner('allOf'),
      anyOf: this._handleSchemaCombiner('anyOf'),
      oneOf: this._handleSchemaCombiner('oneOf'),
      not: this._handleSchemaNot,
      if: this._handleSchemaConditional('if'),
      then: this._handleSchemaConditional('then'),
      else: this._handleSchemaConditional('else'),
      dependentSchemas: this._handleSchemaDependentSchemas,
      additionalProperties: this._handleSchemaAdditionalOrPatternProperties,
      patternProperties: this._handleSchemaAdditionalOrPatternProperties,
      // Add more keyword handlers here as needed
    };

    this.dataKeywordHandlers = {
      properties: this._handleDataProperties,
      items: this._handleDataItems,
      allOf: this._handleDataCombiner('allOf'),
      anyOf: this._handleDataCombiner('anyOf'),
      oneOf: this._handleDataCombiner('oneOf'),
      not: this._handleDataNot,
      if: this._handleDataConditional('if'),
      then: this._handleDataConditional('then'),
      else: this._handleDataConditional('else'),
      dependentSchemas: this._handleDataDependentSchemas,
      // Data traversal for additional/patternProperties might be complex and specific
      // Add handlers if needed for specific use cases
    };
  }

  // --- Public Methods ---

  traverseSchema(schema: JsonSchema | SchemaProperty, callback: SchemaTraversalCallback): void {
    this._traverseSchemaRecursive(schema, [], callback);
  }

  traverseData(schema: JsonSchema | SchemaProperty, data: any, callback: DataTraversalCallback): void {
    this._traverseDataRecursive(schema, data, [], callback);
  }

  // --- Core Recursive Functions (Refactored) ---

  private _traverseSchemaRecursive(
    schemaNode: JsonSchema | SchemaProperty,
    currentPath: string[],
    callback: SchemaTraversalCallback,
    propertyName?: string,
    parentSchemaNode?: JsonSchema | SchemaProperty
  ): void {
    if (typeof schemaNode !== 'object' || schemaNode === null) {
      return;
    }

    const context: SchemaTraversalContext = { schemaNode, path: currentPath, propertyName, parentSchemaNode };
    callback(context);

    const node = schemaNode as any;

    // Iterate through known keywords and execute handlers
    for (const keyword in this.schemaKeywordHandlers) {
      if (Object.prototype.hasOwnProperty.call(node, keyword)) {
        this.schemaKeywordHandlers[keyword](
          node,
          currentPath,
          callback,
          node, // Pass current node as parent for sub-recursion
          this._traverseSchemaRecursive.bind(this) // Pass bound recursive function
        );
      }
    }
  }

  private _traverseDataRecursive(
    schemaNode: JsonSchema | SchemaProperty,
    dataValue: any,
    currentPath: string[],
    callback: DataTraversalCallback,
    propertyName?: string,
    parentSchemaNode?: JsonSchema | SchemaProperty
  ): void {
    if (typeof schemaNode !== 'object' || schemaNode === null) {
      return;
    }

    const context: DataTraversalContext = { schemaNode, dataValue, path: currentPath, propertyName, parentSchemaNode };
    callback(context);

    const node = schemaNode as any;

    // Iterate through known keywords and execute handlers
    for (const keyword in this.dataKeywordHandlers) {
      if (Object.prototype.hasOwnProperty.call(node, keyword)) {
         // Check type compatibility before calling handler (e.g., 'properties' needs object data)
         if (this._isDataCompatible(keyword, node, dataValue)) {
            this.dataKeywordHandlers[keyword](
              node,
              dataValue,
              currentPath,
              callback,
              node, // Pass current node as parent for sub-recursion
              this._traverseDataRecursive.bind(this) // Pass bound recursive function
            );
         }
      }
    }
  }

  // --- Keyword Handlers (Schema) ---

  private _handleSchemaProperties: SchemaKeywordHandler = (node, currentPath, callback, parent, traverse) => {
    if (node.properties) {
      for (const key in node.properties) {
        if (Object.prototype.hasOwnProperty.call(node.properties, key)) {
          traverse(node.properties[key], [...currentPath, key], callback, key, parent);
        }
      }
    }
  };

  private _handleSchemaItems: SchemaKeywordHandler = (node, currentPath, callback, parent, traverse) => {
    if (node.items) {
      if (Array.isArray(node.items)) { // Tuple
        node.items.forEach((itemSchema: SchemaProperty, index: number) => {
          traverse(itemSchema, currentPath, callback, String(index), parent);
        });
      } else { // Single schema for all items
        traverse(node.items, currentPath, callback, undefined, parent);
      }
    }
  };

  private _handleSchemaCombiner = (combiner: 'allOf' | 'anyOf' | 'oneOf'): SchemaKeywordHandler => {
    return (node, currentPath, callback, parent, traverse) => {
      if (Array.isArray(node[combiner])) {
        node[combiner].forEach((subSchema: SchemaProperty) => {
          traverse(subSchema, currentPath, callback, undefined, parent);
        });
      }
    };
  };

  private _handleSchemaNot: SchemaKeywordHandler = (node, currentPath, callback, parent, traverse) => {
    if (typeof node.not === 'object') {
      traverse(node.not, currentPath, callback, undefined, parent);
    }
  };

    private _handleSchemaConditional = (keyword: 'if' | 'then' | 'else'): SchemaKeywordHandler => {
        return (node, currentPath, callback, parent, traverse) => {
            if (node[keyword] && typeof node[keyword] === 'object') {
                traverse(node[keyword], currentPath, callback, undefined, parent);
            }
        };
    };

  private _handleSchemaDependentSchemas: SchemaKeywordHandler = (node, currentPath, callback, parent, traverse) => {
    if (node.dependentSchemas) {
      for (const key in node.dependentSchemas) {
        traverse(node.dependentSchemas[key], currentPath, callback, undefined, parent);
      }
    }
  };

  private _handleSchemaAdditionalOrPatternProperties: SchemaKeywordHandler = (node, currentPath, callback, parent, traverse) => {
    // Handle additionalProperties if it's a schema object
    if (typeof node.additionalProperties === 'object') {
      traverse(node.additionalProperties, currentPath, callback, undefined, parent);
    }
    // Handle patternProperties
    if (node.patternProperties) {
      for (const key in node.patternProperties) {
        traverse(node.patternProperties[key], currentPath, callback, undefined, parent);
      }
    }
  };


  // --- Keyword Handlers (Data) ---

    private _isDataCompatible(keyword: string, node: any, dataValue: any): boolean {
        // Add checks here to prevent trying to traverse incompatible data structures
        // e.g., 'properties' handler requires dataValue to be an object
        if ((keyword === 'properties' || keyword === 'dependentSchemas') && (typeof dataValue !== 'object' || dataValue === null || Array.isArray(dataValue))) {
            return false;
        }
        if (keyword === 'items' && !Array.isArray(dataValue)) {
            return false;
        }
        // Combiners, conditionals, not should generally be compatible as they pass data down
        return true;
    }

  private _handleDataProperties: DataKeywordHandler = (node, dataValue, currentPath, callback, parent, traverse) => {
    // Type check already done by _isDataCompatible
    if (node.properties) {
      for (const key in node.properties) {
        if (Object.prototype.hasOwnProperty.call(node.properties, key)) {
          traverse(node.properties[key], dataValue?.[key], [...currentPath, key], callback, key, parent);
        }
      }
    }
  };

  private _handleDataItems: DataKeywordHandler = (node, dataValue, currentPath, callback, parent, traverse) => {
    // Type check already done by _isDataCompatible
    if (node.items) {
      if (Array.isArray(node.items)) { // Tuple
        node.items.forEach((itemSchema: SchemaProperty, i: number) => {
          if (i < dataValue.length) {
            traverse(itemSchema, dataValue[i], currentPath, callback, String(i), parent);
          }
          // Decide if you want to traverse schema even if data doesn't exist for index
          // else { traverse(itemSchema, undefined, currentPath, callback, String(i), parent); }
        });
      } else { // Regular array
        dataValue.forEach((itemData: any, i: number) => {
          traverse(node.items, itemData, currentPath, callback, String(i), parent);
        });
      }
    }
  };

  private _handleDataCombiner = (combiner: 'allOf' | 'anyOf' | 'oneOf'): DataKeywordHandler => {
    return (node, dataValue, currentPath, callback, parent, traverse) => {
      if (Array.isArray(node[combiner])) {
        node[combiner].forEach((subSchema: SchemaProperty) => {
          traverse(subSchema, dataValue, currentPath, callback, undefined, parent);
        });
      }
    };
  };

  private _handleDataNot: DataKeywordHandler = (node, dataValue, currentPath, callback, parent, traverse) => {
    if (node.not && typeof node.not === 'object') {
      traverse(node.not, dataValue, currentPath, callback, undefined, parent);
    }
  };

    private _handleDataConditional = (keyword: 'if' | 'then' | 'else'): DataKeywordHandler => {
        return (node, dataValue, currentPath, callback, parent, traverse) => {
            if (node[keyword] && typeof node[keyword] === 'object') {
                traverse(node[keyword], dataValue, currentPath, callback, undefined, parent);
            }
        };
    };

  private _handleDataDependentSchemas: DataKeywordHandler = (node, dataValue, currentPath, callback, parent, traverse) => {
    // Type check already done by _isDataCompatible
    if (node.dependentSchemas) {
      for (const key in node.dependentSchemas) {
        if (Object.prototype.hasOwnProperty.call(dataValue, key)) {
          traverse(node.dependentSchemas[key], dataValue, currentPath, callback, undefined, parent);
        }
      }
    }
  };
}
