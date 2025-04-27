import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import _, { mergeWith, isObject, isArray, cloneDeep, isEqual } from 'lodash';
import {
  JsonSchema,
  MergedJsonResult,
  Metadata,
  ValueMetadata,
  GeneratedSchema,
  GeneratedSchemaProperty,
  SchemaProperty,
  MergeOptions,
  DiffOptions,
  ArrayMergeStrategy,
  ArrayDiffStrategy,
  SourceObject,
  PathMetadata,
  GET_METADATA_SYMBOL,
  ObjectWithMetadata,
} from './types';

export class JsonProcessor {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);
  }

  // --- Merge Handlers ---

  private _mergeObjects(obj1: any, obj2: any, options: MergeOptions): any {
    const result = cloneDeep(obj1);
    for (const key in obj2) {
      if (Object.prototype.hasOwnProperty.call(obj2, key)) {
        const val1 = result[key];
        const val2 = obj2[key];
        result[key] = this._mergeValues(val1, val2, options);
      }
    }
    return result;
  }

  private _mergeArrays(arr1: any[], arr2: any[], options: MergeOptions): any[] {
    const strategy = options.arrayStrategy ?? 'replace';
    switch (strategy) {
      case 'concat':
        return arr1.concat(cloneDeep(arr2));
      case 'replace':
      default:
        return cloneDeep(arr2);
    }
  }

  private _mergeValues(val1: any, val2: any, options: MergeOptions): any {
    if (isArray(val1) && isArray(val2)) {
      return this._mergeArrays(val1, val2, options);
    } else if (isObject(val1) && isObject(val2) && !isArray(val1) && !isArray(val2)) {
      return this._mergeObjects(val1, val2, options);
    } else {
      return cloneDeep(val2);
    }
  }

  // --- Diff Handlers ---

  private _diffObjects(obj1: any, obj2: any, options: DiffOptions): any {
    const diff: any = {};
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (!Object.prototype.hasOwnProperty.call(obj1, key)) {
        diff[key] = cloneDeep(val2);
      } else if (!Object.prototype.hasOwnProperty.call(obj2, key)) {
        diff[key] = undefined;
      } else {
        const valueDiff = this._diffValues(val1, val2, options);
        if (valueDiff !== undefined || !isEqual(val1, val2)) {
          if (isObject(valueDiff) && !isArray(valueDiff) && Object.keys(valueDiff).length === 0 && !isEqual(val1, val2)) {
            diff[key] = cloneDeep(val2);
          } else if (valueDiff !== undefined) {
            diff[key] = valueDiff;
          } else if (!isEqual(val1, val2)) {
            diff[key] = cloneDeep(val2);
          }
        }
      }
    }
    return diff;
  }

  private _diffArrays(arr1: any[], arr2: any[], options: DiffOptions): any[] | undefined {
    const strategy = options.arrayStrategy ?? 'replace';

    switch (strategy) {
      case 'elements':
        if (!isEqual(arr1, arr2)) {
          return cloneDeep(arr2);
        }
        return undefined;
      case 'replace':
      default:
        if (!isEqual(arr1, arr2)) {
          return cloneDeep(arr2);
        }
        return undefined;
    }
  }

  private _diffValues(val1: any, val2: any, options: DiffOptions): any {
    if (isEqual(val1, val2)) {
      return undefined;
    }

    if (isArray(val1) && isArray(val2)) {
      return this._diffArrays(val1, val2, options);
    } else if (isObject(val1) && isObject(val2) && !isArray(val1) && !isArray(val2)) {
      const objDiff = this._diffObjects(val1, val2, options);
      return Object.keys(objDiff).length > 0 ? objDiff : undefined;
    } else {
      return cloneDeep(val2);
    }
  }

  // --- Public API Methods ---

  merge(obj1: any, obj2: any, options: MergeOptions = {}): any {
    const base = cloneDeep(obj1);
    return this._mergeValues(base, obj2, options);
  }

  mergeAll(objects: any[], options: MergeOptions = {}): any {
    if (!objects || objects.length === 0) {
      return {};
    }
    return objects.reduce((accumulator, currentObject) => {
      return this.merge(accumulator, currentObject, options);
    }, {});
  }

  diff(obj1: any, obj2: any, options: DiffOptions = {}): any {
    return this._diffValues(obj1, obj2, options) ?? {};
  }

  diffAll(objects: any[], options: DiffOptions = {}): any {
    if (!objects || objects.length < 2) {
      return {};
    }

    let accumulatedDiff = {};
    for (let i = 0; i < objects.length - 1; i++) {
      if (i === 0) {
        accumulatedDiff = this.diff(objects[0], objects[objects.length - 1], options);
      }
    }
    return accumulatedDiff;
  }

  generateSchema(baseSchema: JsonSchema, mergedResult: MergedJsonResult): GeneratedSchema {
    console.warn("generateSchema relies on metadata not produced by the new merge functions and may not work correctly.");

    const { mergedData, metadata } = mergedResult;

    const generatedSchema: GeneratedSchema = JSON.parse(JSON.stringify(baseSchema));

    const traverseAndSetDefaults = (schemaNode: any, dataNode: any, currentPath: string[]) => {
      if (!isObject(schemaNode) || schemaNode === null) return;

      const pathString = currentPath.join('.');
      const node = schemaNode as GeneratedSchemaProperty;
      const valueMeta = pathString ? _.get(metadata, pathString) as ValueMetadata | undefined : undefined;

      delete node.default;
      delete node['x-source-id'];

      if (valueMeta?.sourceId && dataNode !== undefined) {
        node.default = JSON.parse(JSON.stringify(dataNode));
        node['x-source-id'] = valueMeta.sourceId;
      } else if (dataNode !== undefined) {
        const schemaType = Array.isArray(node.type) ? node.type[0] : node.type;
        if (schemaType && schemaType !== 'object' && schemaType !== 'array') {
          node.default = JSON.parse(JSON.stringify(dataNode));
        }
      }

      // Recurse into properties for objects
      if (node.properties && isObject(dataNode)) {
        const properties = node.properties as { [key: string]: GeneratedSchemaProperty };
        for (const key in properties) {
          if (Object.prototype.hasOwnProperty.call(properties, key) && (dataNode as Record<string, any>)[key] !== undefined) {
            traverseAndSetDefaults(properties[key], (dataNode as Record<string, any>)[key], [...currentPath, key]);
          }
        }
      }

      // Recurse into items for arrays (simplified: assumes single schema for items)
      if (node.items && !Array.isArray(node.items) && isArray(dataNode)) {
        const itemsSchema = node.items as GeneratedSchemaProperty;
        dataNode.forEach((item: any, index: number) => {
          traverseAndSetDefaults(itemsSchema, item, [...currentPath, String(index)]);
        });
      }
    };

    traverseAndSetDefaults(generatedSchema, mergedData, []);

    return generatedSchema;
  }

  // --- New Metadata Merge Implementation ---

  mergeAllWithMetadata(
    sourceObjects: SourceObject[],
    options: MergeOptions = {}
  ): { mergedObject: ObjectWithMetadata; metadata: Record<string, PathMetadata> } {
    if (!sourceObjects || sourceObjects.length === 0) {
      return { mergedObject: {}, metadata: {} };
    }

    let finalMergedData: any = {};
    const metadata: Record<string, PathMetadata> = {};

    for (const sourceObject of sourceObjects) {
      finalMergedData = this._mergeRecursiveWithMetadata(
        finalMergedData,
        sourceObject.data,
        sourceObject.id,
        options,
        '',
        new Map<string, PathMetadata>()
      );

      // Collect metadata recursively and store it in the metadata object
      const collectMetadata = (obj: ObjectWithMetadata) => {
        if (obj && typeof obj === 'object') {
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const value = obj[key];
              const metadataForKey = obj[GET_METADATA_SYMBOL]?.(key);
              if (metadataForKey) {
                metadata[metadataForKey.path] = metadataForKey;
              }
              collectMetadata(value);
            }
          }
        }
      };

      collectMetadata(finalMergedData);
    }

    return { mergedObject: finalMergedData, metadata };
  }

  private _mergeRecursiveWithMetadata(
    target: any,
    source: any,
    sourceId: string | number,
    options: MergeOptions,
    currentPath: string,
    parentChildMetadataMap: Map<string, PathMetadata>
  ): any {
    const mergeValue = (value: any, key: string | null = null): PathMetadata => {
      const path = key !== null ? (currentPath ? `${currentPath}.${key}` : key) : currentPath;
      const finalPath = path ?? '';
      return { sourceId, path: finalPath, value: cloneDeep(value) };
    };

    const parentKey = currentPath.includes('.') ? currentPath.substring(currentPath.lastIndexOf('.') + 1) : currentPath;

    if (source === undefined) {
      if (parentKey && parentChildMetadataMap.has(parentKey)) {
        parentChildMetadataMap.delete(parentKey);
      }
      return target;
    }

    if (isArray(source)) {
      const arrayStrategy = options.arrayStrategy ?? 'replace';
      let mergedArray;
      if (isArray(target) && arrayStrategy === 'concat') {
        mergedArray = target.concat(cloneDeep(source));
      } else {
        mergedArray = cloneDeep(source);
      }
      if (parentKey) {
        parentChildMetadataMap.set(parentKey, mergeValue(mergedArray));
      }
      return mergedArray;
    }

    // Case 3: Objects
    if (isObject(source) && !isArray(source)) {
        let resultObject: ObjectWithMetadata;
        const childMetadataMap = new Map<string, PathMetadata>(); // New map for the result

        // Initialize resultObject and populate childMetadataMap from target
        if (isObject(target) && !isArray(target)) {
            resultObject = cloneDeep(target) as ObjectWithMetadata; // Clone target
            // Populate the new map from the original target's metadata
            const targetObj = target as ObjectWithMetadata;
            const getTargetMetaFunc = typeof targetObj[GET_METADATA_SYMBOL] === 'function' ? targetObj[GET_METADATA_SYMBOL] : undefined;
            if (getTargetMetaFunc) {
                // Iterate keys of the original target to get metadata
                // Use Object.keys to ensure we only check own properties
                for (const key of Object.keys(targetObj)) {
                    const targetMeta = getTargetMetaFunc(key);
                    if (targetMeta) {
                        childMetadataMap.set(key, cloneDeep(targetMeta)); // Copy meta to new map
                    }
                }
            }
        } else {
            resultObject = {}; // Start fresh if target wasn't an object
        }

        // Define/Redefine the metadata function on the resultObject (potentially cloned)
        // Ensure it's configurable so it can be replaced on the clone
        Object.defineProperty(resultObject, GET_METADATA_SYMBOL, {
            value: (attributeName: string) => childMetadataMap.get(attributeName),
            writable: false,
            enumerable: false,
            configurable: true, // Needs to be configurable
        });

        // Process source keys, merging recursively into resultObject and updating childMetadataMap
        const sourceKeys = Object.keys(source);
        const sourceObj = source as Record<string, any>;
        for (const key of sourceKeys) {
            const sourceValue = sourceObj[key];
            // Use the current value in resultObject (which might have come from target clone)
            const targetValue = resultObject[key];
            const propertyPath = currentPath ? `${currentPath}.${key}` : key;

            if (sourceValue === undefined) {
                // If source explicitly sets undefined, remove the key and its metadata
                delete resultObject[key];
                childMetadataMap.delete(key);
            } else {
                // Recursive call updates resultObject[key] and populates childMetadataMap
                resultObject[key] = this._mergeRecursiveWithMetadata(
                    targetValue,
                    sourceValue,
                    sourceId,
                    options,
                    propertyPath,
                    childMetadataMap // Pass the map associated with resultObject
                );
            }
        }

        // Update metadata in the parent map for the resultObject itself
        if (parentKey) {
            parentChildMetadataMap.set(parentKey, mergeValue(resultObject));
        }

        return resultObject;
    }

    const primitiveValue = cloneDeep(source);
    if (parentKey) {
      parentChildMetadataMap.set(parentKey, mergeValue(primitiveValue));
    }
    return primitiveValue;
  }
}
