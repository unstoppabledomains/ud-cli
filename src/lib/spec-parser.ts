/**
 * Parses the OpenAPI spec JSON into typed CommandSpec[] used by the command framework.
 */

// --- Types ---

export interface ParamSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: ParamSpec; // for array items
  properties?: ParamSpec[]; // for object children
}

export type ResponsePattern = 'bulk' | 'paginated-offset' | 'simple';

export interface CommandSpec {
  toolName: string;
  operationId: string;
  summary: string;
  description: string;
  params: ParamSpec[];
  responsePattern: ResponsePattern;
  /** Dotted field paths extracted from the response schema (e.g., "listing.price"). */
  responseFields: string[];
}

// --- Internal types for raw OpenAPI structures ---

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  $ref?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  format?: string;
}

interface OperationObject {
  operationId: string;
  summary?: string;
  description?: string;
  requestBody?: {
    required?: boolean;
    content?: {
      'application/json'?: {
        schema?: SchemaObject;
      };
    };
  };
  responses?: Record<
    string,
    {
      content?: {
        'application/json'?: {
          schema?: SchemaObject;
        };
      };
    }
  >;
}

interface OpenAPISpec {
  paths: Record<string, { post?: OperationObject }>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

// --- Ref resolution ---

function resolveRef(spec: OpenAPISpec, ref: string): SchemaObject {
  // e.g. "#/components/schemas/SearchDomainsResponse"
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = spec;
  for (const part of parts) {
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) {
      throw new Error(`Cannot resolve $ref: ${ref}`);
    }
  }
  return current as SchemaObject;
}

function resolveSchema(spec: OpenAPISpec, schema: SchemaObject): SchemaObject {
  if (schema.$ref) {
    return resolveSchema(spec, resolveRef(spec, schema.$ref));
  }
  return schema;
}

// --- Schema → ParamSpec conversion ---

function schemaToParamSpec(
  spec: OpenAPISpec,
  name: string,
  schema: SchemaObject,
  required: boolean,
): ParamSpec {
  const resolved = resolveSchema(spec, schema);

  // Handle oneOf/anyOf — pick the simplest type (prefer string)
  if (resolved.oneOf || resolved.anyOf) {
    const variants = resolved.oneOf ?? resolved.anyOf ?? [];
    const stringVariant = variants.find((v) => {
      const r = resolveSchema(spec, v);
      return r.type === 'string';
    });
    if (stringVariant) {
      return schemaToParamSpec(spec, name, { ...resolved, ...resolveSchema(spec, stringVariant), oneOf: undefined, anyOf: undefined }, required);
    }
    // Fall back to first variant
    if (variants.length > 0) {
      return schemaToParamSpec(spec, name, { ...resolved, ...resolveSchema(spec, variants[0]), oneOf: undefined, anyOf: undefined }, required);
    }
  }

  const rawType = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  const type = normalizeType(rawType);

  const param: ParamSpec = {
    name,
    type,
    required,
    description: resolved.description ?? schema.description,
    enum: resolved.enum,
    default: resolved.default,
    minimum: resolved.minimum,
    maximum: resolved.maximum,
  };

  if (type === 'array' && resolved.items) {
    const itemSchema = resolveSchema(spec, resolved.items);
    param.items = schemaToParamSpec(spec, name + '[]', itemSchema, false);
  }

  if (type === 'object' && resolved.properties) {
    param.properties = Object.entries(resolved.properties).map(([propName, propSchema]) =>
      schemaToParamSpec(spec, propName, propSchema, (resolved.required ?? []).includes(propName)),
    );
  }

  return param;
}

function normalizeType(type?: string): ParamSpec['type'] {
  switch (type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

// --- Response pattern detection ---

function detectResponsePattern(spec: OpenAPISpec, operation: OperationObject): ResponsePattern {
  const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;
  if (!responseSchema) return 'simple';

  const resolved = resolveSchema(spec, responseSchema);
  const props = resolved.properties ?? {};

  // Bulk pattern: has successCount/failureCount
  if (props.successCount && props.failureCount) {
    return 'bulk';
  }

  // Paginated pattern: check pagination sub-object
  if (props.pagination) {
    const pag = resolveSchema(spec, props.pagination);
    const pagProps = pag.properties ?? {};
    if (pagProps.offset || pagProps.nextOffset) return 'paginated-offset';
  }

  return 'simple';
}

// --- Response field extraction ---

/** Keys that typically hold the primary data array in API responses. */
const DATA_ARRAY_KEYS = ['results', 'domains', 'tlds', 'records', 'items', 'contacts', 'offers', 'leads', 'messages', 'listings', 'savedCards', 'configs', 'pushedDomains', 'failedDomains', 'addedProducts'];

/**
 * Extract dotted field paths from the response schema.
 * Finds the primary data array and walks its item schema to produce
 * paths like "listing.price", "autoRenewal.status".
 */
function extractResponseFields(spec: OpenAPISpec, operation: OperationObject): string[] {
  const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;
  if (!responseSchema) return [];

  const resolved = resolveSchema(spec, responseSchema);
  const props = resolved.properties ?? {};

  // Find the primary data array and extract field paths from its items
  for (const key of DATA_ARRAY_KEYS) {
    if (props[key]) {
      const arrSchema = resolveSchema(spec, props[key]);
      const rawType = Array.isArray(arrSchema.type) ? arrSchema.type[0] : arrSchema.type;
      if (rawType === 'array' && arrSchema.items) {
        const itemSchema = resolveSchema(spec, arrSchema.items);
        return collectFieldPaths(spec, itemSchema, '', 3);
      }
    }
  }

  // No data array found — extract top-level scalar/object fields (skip pagination, meta keys)
  const skipKeys = new Set(['pagination', 'truncated', 'truncationMessage', 'successCount', 'failureCount']);
  return collectFieldPaths(spec, resolved, '', 3).filter((f) => !skipKeys.has(f.split('.')[0]));
}

/**
 * Recursively collect dotted field paths from a schema object.
 * Stops at the given depth to avoid excessive nesting.
 */
function collectFieldPaths(spec: OpenAPISpec, schema: SchemaObject, prefix: string, maxDepth: number): string[] {
  if (maxDepth <= 0) return [];

  const resolved = resolveSchema(spec, schema);

  // Handle oneOf/anyOf — pick the object variant if available
  if (resolved.oneOf || resolved.anyOf) {
    const variants = resolved.oneOf ?? resolved.anyOf ?? [];
    const objVariant = variants.find((v) => {
      const r = resolveSchema(spec, v);
      return r.type === 'object' || r.properties;
    });
    if (objVariant) {
      return collectFieldPaths(spec, objVariant, prefix, maxDepth);
    }
    // Non-object union — treat as leaf
    return prefix ? [prefix] : [];
  }

  const props = resolved.properties;
  if (!props) {
    return prefix ? [prefix] : [];
  }

  const paths: string[] = [];
  for (const [key, propSchema] of Object.entries(props)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const propResolved = resolveSchema(spec, propSchema);
    const rawType = Array.isArray(propResolved.type) ? propResolved.type[0] : propResolved.type;

    if ((rawType === 'object' || propResolved.properties) && !propResolved.enum) {
      // Recurse into nested objects
      paths.push(...collectFieldPaths(spec, propResolved, fullPath, maxDepth - 1));
    } else {
      // Leaf field (string, number, boolean, array of primitives, enum)
      paths.push(fullPath);
    }
  }
  return paths;
}

// --- Main parser ---

export function parseSpec(raw: OpenAPISpec): CommandSpec[] {
  const specs: CommandSpec[] = [];

  for (const [path, methods] of Object.entries(raw.paths)) {
    const operation = methods.post;
    if (!operation) continue;

    // Extract tool name from path: /mcp/v1/actions/ud_domains_search → ud_domains_search
    const toolName = path.split('/actions/')[1];
    if (!toolName) continue;

    const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
    const resolved = reqSchema ? resolveSchema(raw, reqSchema) : undefined;

    const params: ParamSpec[] = [];
    if (resolved?.properties) {
      const requiredSet = new Set(resolved.required ?? []);
      for (const [propName, propSchema] of Object.entries(resolved.properties)) {
        params.push(schemaToParamSpec(raw, propName, propSchema, requiredSet.has(propName)));
      }
    }

    specs.push({
      toolName,
      operationId: operation.operationId,
      summary: operation.summary ?? '',
      description: operation.description ?? '',
      params,
      responsePattern: detectResponsePattern(raw, operation),
      responseFields: extractResponseFields(raw, operation),
    });
  }

  return specs;
}
