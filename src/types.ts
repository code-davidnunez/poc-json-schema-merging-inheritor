// src/types.ts

// Keep JsonSchema, GeneratedSchema, GeneratedSchemaProperty
export interface JsonSchema {
  type?: string | string[];
  properties?: { [key: string]: JsonSchema };
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  default?: any;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  dependentSchemas?: { [key: string]: JsonSchema };
  [key: string]: any; // Allow other properties like description, minLength etc.
}

// Add alias for clarity when referring to a schema node that represents a property
export type SchemaProperty = JsonSchema;

export interface GeneratedSchemaProperty extends JsonSchema {
  default?: any;
  'x-source-id'?: string; // Custom property to track source
}

export interface GeneratedSchema extends JsonSchema {
  properties?: { [key: string]: GeneratedSchemaProperty };
  items?: GeneratedSchemaProperty | GeneratedSchemaProperty[];
  allOf?: GeneratedSchema[];
  anyOf?: GeneratedSchema[];
  oneOf?: GeneratedSchema[];
  not?: GeneratedSchema;
  if?: GeneratedSchema;
  then?: GeneratedSchema;
  else?: GeneratedSchema;
  dependentSchemas?: { [key: string]: GeneratedSchema };
  default?: any;
  'x-source-id'?: string;
}

// Add MergeOptions and DiffOptions related types
export type ArrayMergeStrategy = 'replace' | 'concat'; // Add more strategies as needed
export type ArrayDiffStrategy = 'replace' | 'elements'; // Add more strategies as needed

export interface MergeOptions {
  arrayStrategy?: ArrayMergeStrategy;
  // Add other merge options here, e.g., custom merge functions per path
}

export interface DiffOptions {
  arrayStrategy?: ArrayDiffStrategy;
  // Add other diff options here
}

/** Represents a source object with a user-defined ID */
export interface SourceObject<T = any> {
  /** User-provided identifier for the source (string or number). Does not need to be unique. */
  id: string | number;
  /** The actual JSON data. */
  data: T;
}

/** Metadata associated with a specific property path in the merged result. */
export interface PathMetadata {
  /** The ID of the source object that provided the final value for this path. */
  sourceId: string | number;
  /** The full path string (e.g., 'a.b.c', 'a.d[0]'). */
  path: string;
  /** The value at this path */
  value: any;
}

/**
 * Symbol used to attach the metadata retrieval function to merged objects.
 * Using a Symbol makes it non-enumerable and less likely to clash with user data.
 */
export const GET_METADATA_SYMBOL = Symbol.for('__getMetadataForAttribute');

// Keep Metadata related types
export interface ValueMetadata {
  sourceId: string;
}

export interface Metadata {
  [key: string]: ValueMetadata | Metadata;
}

// Keep MergedJsonResult
export interface MergedJsonResult {
  mergedData: Record<string, any>;
  metadata: Metadata;
}

// Add the interface for objects that have the metadata function
export interface ObjectWithMetadata {
    [GET_METADATA_SYMBOL]?: (attributeName: string) => PathMetadata | undefined;
    [key: string]: any; // Allow other properties
}
