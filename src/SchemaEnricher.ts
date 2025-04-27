import { JSONSchema7 } from 'json-schema';
import { DataTraversalContext, SchemaTraversalContext, SchemaTraverser } from './SchemaTraverser';
import { SourceObject, PathMetadata, GET_METADATA_SYMBOL } from './types';
import { JsonProcessor } from './JsonProcessor';

export class SchemaEnricher {
  enrichSchema(
    schema: JSONSchema7,
    schemaUI: Record<string, any>,
    jsonArray: Array<{ id: string; [key: string]: any }>
  ): { schema: JSONSchema7; schemaUI: Record<string, any>; mergedJson: any } {
    // Step 1: Prepare SourceObjects for merging
    const sourceObjects: SourceObject[] = jsonArray.map((json) => ({
      id: json.id,
      data: json,
    }));

    // Step 2: Merge all JSONs with metadata
    const { mergedObject, metadata } = new JsonProcessor().mergeAllWithMetadata(sourceObjects);

    // Step 3: Traverse the schema and enrich the schemaUI
    const traverser = new SchemaTraverser();
    traverser.traverseData(schema as any, mergedObject, ({ schemaNode, path, dataValue }: DataTraversalContext) => {
      const metadataForPath: PathMetadata | undefined = metadata[path.join('.')];
      if (metadataForPath) {
        schemaUI[path.join('.')] = {
          widget: {
            sourceIds: Array.isArray(metadataForPath.sourceId) ? metadataForPath.sourceId : [metadataForPath.sourceId],
            inheritedValue: metadataForPath.value,
          },
        };
      }
    });

    return { schema, schemaUI, mergedJson: mergedObject };
  }
}
