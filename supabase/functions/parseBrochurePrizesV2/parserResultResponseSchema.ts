type JsonSchema = {
  type: string | string[];
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
};

const confidenceSchema: JsonSchema = {
  type: "string",
  enum: ["HIGH", "MEDIUM", "LOW"],
  description: "Extraction confidence for this object.",
};

const safeText = (max = 300): JsonSchema => ({
  type: "string",
  description: `Safe extracted text no longer than ${max} characters.`,
});

const nullableString: JsonSchema = { type: ["string", "null"] };
const nullableNumber: JsonSchema = { type: ["number", "null"] };
const nullableBoolean: JsonSchema = { type: ["boolean", "null"] };

const stringList = (maxItems: number, maxText = 300): JsonSchema => ({
  type: "array",
  items: safeText(maxText),
  maxItems,
});

const sourcePage: JsonSchema = {
  type: ["integer", "null"],
  minimum: 1,
  maximum: 500,
  description: "1-based PDF page number for the extracted evidence, or null when unknown.",
};

const giftItemSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "qty"],
  properties: {
    name: { type: "string", description: "Gift item name, 1 to 120 characters." },
    qty: { type: "integer", minimum: 1, maximum: 999, description: "Positive item quantity." },
  },
};

const prizeSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "place",
    "prize_name",
    "cash_amount",
    "currency",
    "has_trophy",
    "has_medal",
    "gift_items",
    "confidence",
    "source_page",
    "source_text_excerpt",
    "warnings",
    "unknowns",
  ],
  properties: {
    place: { type: ["integer", "null"], minimum: 1, maximum: 500 },
    prize_name: { type: ["string", "null"], description: "Prize label or name when present; null when only place/amount is known." },
    cash_amount: { type: "number", minimum: 0, maximum: 100000000 },
    currency: { type: ["string", "null"], description: "Currency code or symbol when present, otherwise null." },
    has_trophy: { type: "boolean" },
    has_medal: { type: "boolean" },
    gift_items: { type: "array", items: giftItemSchema, maxItems: 50 },
    confidence: confidenceSchema,
    source_page: sourcePage,
    source_text_excerpt: { type: ["string", "null"], description: "Evidence excerpt, at most 500 characters, or null." },
    warnings: stringList(50),
    unknowns: stringList(50),
  },
};

const criteriaSuggestionsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category_type",
    "age_band",
    "gender",
    "rating_min",
    "rating_max",
    "state",
    "city",
    "club",
    "unrated_only",
    "requires_manual_confirmation",
  ],
  properties: {
    category_type: nullableString,
    age_band: nullableString,
    gender: nullableString,
    rating_min: nullableNumber,
    rating_max: nullableNumber,
    state: nullableString,
    city: nullableString,
    club: nullableString,
    unrated_only: nullableBoolean,
    requires_manual_confirmation: { type: "boolean" },
  },
};

const categorySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "is_main",
    "order_idx",
    "criteria_suggestions",
    "confidence",
    "source_page",
    "source_text_excerpt",
    "warnings",
    "unknowns",
    "prizes",
  ],
  properties: {
    name: { type: "string", description: "Prize category name, 1 to 160 characters." },
    is_main: { type: "boolean" },
    order_idx: { type: ["integer", "null"], minimum: 0, maximum: 1000 },
    criteria_suggestions: criteriaSuggestionsSchema,
    confidence: confidenceSchema,
    source_page: sourcePage,
    source_text_excerpt: { type: ["string", "null"], description: "Evidence excerpt, at most 500 characters, or null." },
    warnings: stringList(50),
    unknowns: stringList(50),
    prizes: { type: "array", items: prizeSchema, maxItems: 200 },
  },
};

export const PARSER_RESULT_RESPONSE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "source", "tournament_details", "overall_confidence", "blocked", "warnings", "unknowns", "categories"],
  properties: {
    status: { type: "string", enum: ["ok_draft", "blocked_low_confidence", "parser_error"] },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["page_count", "ocr_used", "ocr_quality"],
      properties: {
        page_count: { type: ["integer", "null"], minimum: 1, maximum: 500 },
        ocr_used: nullableBoolean,
        ocr_quality: { type: ["string", "null"], enum: ["high", "medium", "low", "unknown", null] },
      },
    },
    tournament_details: {
      type: "object",
      additionalProperties: false,
      required: ["title", "city", "state", "venue", "start_date", "end_date", "registration_fee", "time_control", "total_prize_fund", "contacts"],
      properties: {
        title: nullableString,
        city: nullableString,
        state: nullableString,
        venue: nullableString,
        start_date: nullableString,
        end_date: nullableString,
        registration_fee: nullableNumber,
        time_control: nullableString,
        total_prize_fund: nullableNumber,
        contacts: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "phone", "role"],
            properties: { name: nullableString, phone: nullableString, role: nullableString },
          },
        },
      },
    },
    overall_confidence: confidenceSchema,
    blocked: { type: "boolean" },
    warnings: stringList(200),
    unknowns: stringList(200),
    categories: { type: "array", items: categorySchema, maxItems: 80 },
  },
};
