/**
 * Transforms a stored extraction schema into a Gemini-safe structured-output schema.
 *
 * The active schema lives in `extraction_schemas` and is authored as plain JSON Schema.
 * Gemini's `responseJsonSchema` accepts only a subset of it, so the conversion happens at
 * request time rather than by maintaining a second hand-written copy that would drift.
 *
 * Two transforms matter:
 *  - Unsupported keywords (`default`, `format`) are dropped; a `format: "date"` hint is
 *    folded into the description so the model still emits YYYY-MM-DD.
 *  - Every property becomes nullable *and* required. Required-plus-nullable is what lets the
 *    model say "the brochure does not state this" instead of inventing a value to satisfy the
 *    schema — the distinction the trust check depends on.
 */

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
  default?: unknown;
};

const CARRIED_KEYWORDS = ["minimum", "maximum", "minItems", "maxItems"] as const;

function withNull(schema: JsonSchema): JsonSchema {
  const declared = schema.type === undefined ? [] : Array.isArray(schema.type) ? [...schema.type] : [schema.type];
  if (!declared.includes("null")) declared.push("null");
  const out: JsonSchema = { ...schema, type: declared };
  if (out.enum && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return out;
}

function convert(node: JsonSchema, nullable: boolean): JsonSchema {
  const out: JsonSchema = {};
  if (node.type !== undefined) out.type = node.type;

  // `format` is dropped but its meaning is preserved as an instruction to the model, unless
  // the authored description already spells the format out.
  const describesFormat = /yyyy-mm-dd/i.test(node.description ?? "");
  const dateHint = node.format === "date" && !describesFormat ? "Date formatted as YYYY-MM-DD." : "";
  const description = [node.description, dateHint].filter(Boolean).join(" ");
  if (description) out.description = description;

  if (node.enum) out.enum = [...node.enum];
  for (const keyword of CARRIED_KEYWORDS) {
    if (node[keyword] !== undefined) out[keyword] = node[keyword];
  }

  if (node.properties) {
    out.type = "object";
    out.properties = {};
    for (const [key, child] of Object.entries(node.properties)) {
      out.properties[key] = convert(child, true);
    }
    out.required = Object.keys(node.properties);
    out.additionalProperties = false;
  }

  // Array *items* stay non-nullable — a list of nulls carries no information.
  if (node.items) {
    out.type = "array";
    out.items = convert(node.items, false);
  }

  return nullable ? withNull(out) : out;
}

export function toGeminiResponseSchema(schema: JsonSchema): JsonSchema {
  return convert(schema, false);
}
