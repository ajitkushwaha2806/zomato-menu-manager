import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { safeParseModelJson } from "@/lib/json-parser";

const bedrockClient = new BedrockRuntimeClient({ region: "ap-southeast-2" });

function buildContentBlock(fileBuffer, mimeType) {
    const cleanMime = mimeType.toLowerCase().split(";")[0].trim();

    if (cleanMime === "application/pdf" || cleanMime.endsWith("pdf")) {
        return {
            document: {
                name: `MenuPage_${Date.now()}`,
                format: "pdf",
                source: { bytes: new Uint8Array(fileBuffer) }
            }
        };
    }

    let imageExt = cleanMime.replace("image/", "");
    if (imageExt === "jpg") imageExt = "jpeg";

    const allowedFormats = ["gif", "jpeg", "png", "webp"];
    if (!allowedFormats.includes(imageExt)) imageExt = "jpeg";

    return {
        image: {
            format: imageExt,
            source: { bytes: new Uint8Array(fileBuffer) }
        }
    };
}

export async function extractRawMenuText(fileBuffer, mimeType = "application/pdf") {
    const contentBlock = buildContentBlock(fileBuffer, mimeType);

    const systemPromptText = `
You are a meticulous transcriber. You look at a restaurant menu image/PDF and write down exactly what is printed on it, in plain text. You do not interpret, reorganize, categorize, or apply any business rules. You are a pair of eyes, not a formatter.
//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori  FORMAT THE PAGE ACCORDINGLY
`;

    const promptText = `

Transcribe this menu page exactly as it appears. If the page layout is split into multiple vertical columns (like a newspaper), read down the entire first column completely before moving to the top of the next column. Group the transcription block-by-block based on these columns so that items in the same category stay together.
 

Smartly make a difference between a category , variant , description and item . do not think category as item or item as category . 
==================================================
OUTPUT FORMAT — FOLLOW EXACTLY
==================================================
For every section you see on the page (a section is any heading that visually starts a new group of items, e.g. "TANDOORI STARTERS", "GRAVY", "CHINESE", "BREADS", "SALAD", "MAGGI", "BURGER" — transcribe whatever heading is printed, even if you're not sure it's a real category), output a block like this:
 
-----------------
SECTION NAME (Column1, Column2, ...)
-----------------
ITEM NAME price1 price2 ...
ITEM NAME price1 price2 ...
 
Rules for this format:
1. The "-----------------" delimiter line (exactly 17 dashes) goes directly above and directly below the section name line. Leave one blank line after the block before the next one starts.
2. If the section has column headers printed near it (e.g. "HALF FULL", "QTR HALF FULL", "250ML 500ML"), put them in parentheses after the section name, comma-separated, in the SAME left-to-right order they're printed: e.g. "TANDOORI STARTERS (Half, Full)" or "GRAVY (Qtr, Half, Full)".
3. If a section has NO column headers (just one price per item), omit the parentheses entirely: just "BREADS".
4. If the exact same section name and column headers repeat later on the page for a different group of items (e.g. "TANDOORI STARTERS" appears again for chicken items after appearing for veg items), still start a fresh block with its own delimiters — do not merge it into the earlier block.
5. Under each section, write ONE item per line: the item name, then every price printed for that item, space-separated, in the SAME left-to-right order as the column headers for that section. Do not merge, split, reorder, or interpret the prices — just carry over what's printed next to the item, in order.
6. If an item has only one price and the section has no columns, the line is just: ITEM NAME price
7. Preserve every price token exactly as printed, including odd cases like "100/120" — write it exactly as printed, don't split it.
8. Transliterate any non-English script (Hindi, etc.) into English/Hinglish by sound, not translation (e.g. "पनीर टिक्का" -> "Paneer Tikka").
9. Preserve any markers you see (veg/non-veg dot, "N", "V", chef's special star, spice level, "(SPL)", "(2/4 Pcs)", etc.) as part of the item name/line exactly as printed, in words if it's a symbol.
10. Do not skip anything, do not summarize, do not invent anything not visibly printed.
11. If something is illegible, write "[illegible]" in place of that token rather than guessing.
12. Output plain text only in the format above — no JSON, no markdown tables, no extra commentary before or after.
 
Now transcribe the page.
`;

    const commandInput = {
        modelId: "amazon.nova-lite-v1:0",
        system: [{ text: systemPromptText }],
        messages: [
            {
                role: "user",
                content: [contentBlock, { text: promptText }]
            }
        ],
        inferenceConfig: {
            maxTokens: 10000,
            temperature: 0
        }
    };

    try {
        const command = new ConverseCommand(commandInput);
        const response = await bedrockClient.send(command);

        const content = response?.output?.message?.content || [];
        const rawText = content.map(block => block.text || "").join("\n").trim();

        return { rawText, error: false };
    } catch (error) {
        console.error("Failed during raw menu transcription (stage 1):", error);
        return { rawText: "", error: true, message: error.message };
    }
}

export async function semiStructuredMenuFromRawText(rawText) {
    const systemPrompt = `
You are an expert restaurant menu extraction engine.

You are executing Stage 2 of a multi-stage menu processing pipeline.

Your ONLY responsibility is converting OCR text into structured menu items.
//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori 

Do NOT clean data.

Do NOT normalize names.

Do NOT correct OCR.

Do NOT merge duplicate items.

Do NOT infer missing prices.

Do NOT classify vegetarian or non-vegetarian.

Do NOT infer meat types.

Do NOT extract descriptions or random text as menu items.

Return data ONLY in the requested JSON format.

Never reply with plain text.

Never explain your reasoning.

You MUST output exactly one JSON object wrapped in \`\`\`json ... \`\`\`
The JSON must have the following structure:

//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori 
{
  "items": [
    {
      "name": "Item name exactly as extracted",
      "category": "Category this item belongs to",
      "base_price": 100, // Or null if variants exist
      "variants": [      // ONLY if there are variants, otherwise omit.
         {
           "property_name": "Portion|Size|Volume|Weight|Pieces|Variant",
           "options": [
              { "option_name": "string", "price": 100 },
              {"option_name": "string", "price": 200 }
           ]
         }
      ]
    }
  ]
}
`;

    const promptText = `
Convert the following OCR text into structured menu items.

====================================================
OCR TEXT
====================================================
//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori 

${rawText}

====================================================
OBJECTIVE
====================================================

Extract every visible menu item into structured JSON.

This stage is ONLY responsible for

✔ Detecting categories

✔ Detecting menu item names

✔ Detecting prices

✔ Detecting shared variants

✔ Building initial JSON

Later stages will perform

✘ Deduplication

✘ OCR correction

✘ Name normalization

✘ Veg / Non-Veg detection

✘ Meat type detection

✘ Description generation

✘ Formatting

====================================================
CATEGORY RULES
====================================================

A category remains active until another category appears.

Example

BURGER

Veg Burger 50

Chicken Burger 80

Both belong to category

Burger

Ignore decorative separators.

Example

-----------------------

Ignore duplicated category headers.

Example

BURGER

BURGER

Treat them as a single category.

====================================================
ITEM NAME RULES
====================================================

Everything before the first detected price belongs to the item name.

Do NOT remove words from the item name.
Do NOT fix spelling.

IMPORTANT: Do NOT extract item descriptions, subtitles, or random words as standalone menu items. 
If a line of text does not have a price next to it, AND it reads like a description of the dish above it, you MUST assign that text to the 'description' field of the dish above it. Do NOT extract it as its own item!

Examples of real items:
"BOOONDI RAIITA 50" -> Extract "BOOONDI RAIITA"
"STUFED PARANTH 60" -> Extract "STUFED PARANTH"

Examples of descriptions:
"A delicious blend of spices" -> Add to the 'description' field of the item directly above it.
"Served with raita" -> Add to the 'description' field of the item directly above it.

====================================================
PRICE RULES
====================================================

Extract prices exactly.

Never modify prices.

Never calculate prices.

Never guess prices.

If price cannot be read

base_price = null

====================================================
BASE PRICE RULE
====================================================

If only ONE selling price exists

Return

{
  "base_price": number
}

Example

VEG BURGER 60

↓

{
  "name":"VEG BURGER",
  "category":"BURGER",
  "base_price":60
}

Do NOT create variants.

====================================================
VARIANT DETECTION
====================================================

Categories may define shared variants.

Examples

(Half, Full)

(Half, Quarter, Full)

(Small, Medium, Large)

(Regular, Large)

(250ml, 500ml)

(500ml, 1L)

These variants apply to every item under that category until another category begins.

Infer property_name using these rules

Half / Full / Quarter

→ Portion

Small / Medium / Large

→ Size

Regular / Large / Jumbo

→ Size

250ml / 500ml / 750ml / 1L

→ Volume

CRITICAL RESTRICTION ON VARIANTS:
The ONLY permitted property_names for variants are: Portion, Size, Volume, Pieces.
NEVER create a variant property named "Type", "Meat", "Protein", "Choice", "Veg/Non-Veg", or anything similar. 
If an item has Veg/Chicken/Mutton options (e.g. Hakka Noodles - Veg 150, Chicken 180), DO NOT make them variants! You MUST extract them as TWO SEPARATE items: "Veg Hakka Noodles" and "Chicken Hakka Noodles".
If you create a variant for Veg/Chicken, the extraction is considered a FAILURE.

====================================================
VARIANT CREATION
====================================================

Create variants ONLY when BOTH conditions are true

Condition 1

The category explicitly defines shared variant sizes inside parentheses (e.g., (Half, Full) or (Small, Large)).

AND

Condition 2

The item has multiple prices listed next to it, corresponding to those shared variants.

Otherwise

Return base_price.

CRITICAL RULE FOR VARIANTS: 
NEVER treat a list of distinct food items as "variants" of a category header!
For example, if the text is:
-----------------
Mojito
-----------------
Strawberry Mojito 49
Mango Mojito 49

These are TWO SEPARATE ITEMS (Strawberry Mojito and Mango Mojito) under the category "Mojito". 
They are NOT variants of a single "Mojito" item! Variants ONLY exist for sizes/portions (Half/Full/Small/Large).

CRITICAL RULE FOR VEG/NON-VEG:
NEVER club Veg and Non-Veg items together as variants of a single item!
For example, if the text has a category or item like "Fried Rice" with columns for "(Veg, Chicken)" and prices "150 200".
You MUST create TWO SEPARATE items:
1. "Veg Fried Rice" with base_price 150
2. "Chicken Fried Rice" with base_price 200
DO NOT create a single "Fried Rice" item with variants "Veg" and "Chicken". Veg and Non-Veg versions of a dish are ALWAYS separate items.

Never create variants with only one option.

Example

Category

(Half, Full)

Item

Chicken Lollipop 200 350

↓

variants

Example

Veg Burger 60

↓

base_price

====================================================
PRICE MAPPING
====================================================

Prices map from left to right.

Example

Half Full

130 220

↓

Half → 130

Full → 220

Example

Small Medium Large

80 120 160

↓

Small → 80

Medium → 120

Large → 160

====================================================
PRICE SORTING
====================================================

Sort every variant option by ascending numeric price before returning.

Example

Full 350

Half 200

↓

Half 200

Full 350

====================================================
PRICE COUNT MISMATCH
====================================================

If variant count and price count do not match, you must ONLY create options for the prices that actually exist. 

NEVER assign a price of 0 or null to fill in missing variants.
If an option (e.g. "Full") has no corresponding price in the text, you MUST OMIT that option entirely from the "options" array.

Example

Category
(Qtr, Half, Full)

Item
Paneer Do Pyaza 210 310

↓

options:
- Qtr: 210
- Half: 310
(OMIT Full because it has no price. NEVER output Full: 0)

====================================================
DUPLICATES
====================================================

Extract duplicate menu items exactly as they appear.

Do NOT merge duplicates.

Duplicate removal happens later.

====================================================
OUTPUT REQUIREMENTS
====================================================

Return ONLY valid JSON wrapped in \`\`\`json ... \`\`\`.

Every extracted item MUST contain

name

category

description (only if a description is present in the text)

Exactly ONE of

base_price

OR

variants

Never both.

Never neither.

Never return empty variants.

Every variant must contain

property_name

options

Every option must contain

option_name

price

====================================================
FINAL VALIDATION
====================================================

Before calling the tool verify

✓ Every visible menu item extracted

✓ Categories assigned correctly

✓ Separator lines ignored

✓ Duplicate category headers ignored

✓ No OCR corrections

✓ No normalization

✓ Exactly one pricing representation

✓ Variant options sorted by ascending price

✓ Valid JSON
`;

    const commandInput = {
        modelId: "amazon.nova-lite-v1:0",

        system: [
            {
                text: systemPrompt
            }
        ],

        messages: [
            {
                role: "user",
                content: [
                    {
                        text: promptText
                    }
                ]
            }
        ],

        inferenceConfig: {
            temperature: 0,
            topP: 0.9,
            maxTokens: 10000
        }
    };

    try {
        const command = new ConverseCommand(commandInput);
        const response = await bedrockClient.send(command);
        const content = response?.output?.message?.content || [];

        const rawResponse = content
            .map((block) => block.text || "")
            .join("\n")
            .trim();

        if (rawResponse) {
            const parsed = safeParseModelJson(rawResponse);
            return {
                success: true,
                error: false,
                items: parsed.items || [],
                raw_text: rawText
            };
        }

        return {
            success: false,
            error: true,
            message: "Model returned no structured output.",
            items: [],
            raw_text: rawText
        };
    } catch (error) {
        console.error(
            "Stage 2 Menu Extraction Error:",
            error
        );

        return {
            success: false,
            error: true,
            message: error.message,
            items: [],
            raw_text: rawText
        };
    }
}

export function parseSemiMenuStructure(items) {
    if (!Array.isArray(items)) {
        return {
            parsedItems: [],
            items: [],
        };
    }

    const parsedItems = items.map((item, idx) => {
        const variants = (item.variants || [])
            .map((variant) => ({
                ...variant,
                options: (variant.options || []).filter(
                    (option) => option.price !== null && option.price !== undefined
                ),
            }))
            .filter((variant) => variant.options.length > 0);
        let basePrice = item.base_price ?? null;
        if (variants.length > 0) {
            const prices = variants.flatMap((variant) =>
                variant.options.map((option) => option.price)
            );

            if (prices.length > 0) {
                basePrice = Math.min(...prices);
            }
        }

        return {
            ...item,
            base_price: basePrice,
            variants,
        };
    });

    return {
        items: parsedItems,
    };
}

export async function extractMenuFromImage(fileBuffer, mimeType = "application/pdf") {
    const { rawText, error: stage1Error, message: stage1Message } = await extractRawMenuText(fileBuffer, mimeType);
    console.log("rawText", rawText)

    if (stage1Error) {
        return { data: rawText, error: true, stage: "transcription", message: stage1Message };
    }

    if (!rawText) {
        return { data: [], error: true, stage: "transcription", message: "No text could be transcribed from the page." };
    }

    const structured = await semiStructuredMenuFromRawText(rawText);

    if (structured?.error) {
        return { ...structured, stage: "structuring", rawText };
    }

    const { items } = parseSemiMenuStructure(structured.items);
    return { items, rawText };
}

export async function enrichMenuItems(itemsPayload) {
    const systemPrompt = `You are a food and menu expert.

You will be provided a list of menu items. Each item has an 'id' and 'name'.

Your tasks are:

1. Determine 'is_veg': must be exactly one of "VEG", "NON_VEG", or "EGG". **CRITICAL:** Only mark it as "NON_VEG" when you are strictly sure it is a non-veg item or the title contains a non-veg thing name. Otherwise, mark it as "VEG".
2. Determine 'meatTypes':
   - If NON_VEG, list the meat types (e.g. ["chicken", "mutton", "fish", "prawns", "beef", "pork"]).
   - If VEG or EGG, this MUST be an empty array [].
3. Normalize the item 'name'.

NAME NORMALIZATION RULES:
-//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori 
- The final name MUST be concise.
- The final name MUST NOT exceed 4 words unless absolutely necessary to prevent duplicates.
- Fix any spelling mistakes in the dish name.
- Remove unnecessary adjectives, marketing words, and descriptions.
- Keep only the core dish name.
- Preserve the original meaning.
- **CRITICAL:** Do NOT rename items in a way that creates duplicates. If normalizing two different items would result in the exact same name, keep enough original context (like size, flavor, or variant keywords) so they remain distinct.
- Do NOT invent new dishes.
- Examples:
  - "Delicious Spicy Chicken Biryani with Raita" → "Chicken Biryani"
  - "Fresh Creamy Tomato Soup" → "Tomato Soup"
  - "Paneer Butter Masala Special" → "Paneer Butter Masala"
  - "Classic Veg Cheese Burger" → "Veg Cheese Burger"
  - "Chiken Tikka" → "Chicken Tikka" (Fixed spelling)

4. You MUST include EVERY item from the input.
5. You MUST preserve the exact 'id'.

Return exactly one JSON object wrapped in \`\`\`json ... \`\`\`

{
  "items": [
    {
      "id": "string",
      "name": "string",
      "is_veg": "VEG|NON_VEG|EGG",
      "meatTypes": ["string"]
    }
  ]
}
`;

    const commandInput = {
        modelId: "amazon.nova-lite-v1:0",
        messages: [
            {
                role: "user",
                content: [{ text: `Here are the menu items to enrich:\n${JSON.stringify(itemsPayload, null, 2)}` }]
            }
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
            temperature: 0.1,
            topP: 0.9,
            maxTokens: 10000
        }
    };

    try {
        const command = new ConverseCommand(commandInput);
        const response = await bedrockClient.send(command);
        const content = response?.output?.message?.content || [];

        const rawResponse = content
            .map((block) => block.text || "")
            .join("\n")
            .trim();

        if (rawResponse) {
            const parsed = safeParseModelJson(rawResponse);
            return parsed.items || [];
        }

        return [];
    } catch (error) {
        console.error("AI Enrichment Error:", error);
        return { error: true, message: error.message };
    }
}

export async function normalizeMenuHierarchy(itemsPayload) {
    const systemPrompt = `You are an expert restaurant menu organizer.
You will be given a list of menu items. Each item has an 'id', 'name', and an original 'category'.
Your task is to intelligently group these items into a deep hierarchy of Categories and Sub-categories.

STRICT RULES:
1. Fix Spelling Mistakes if any and make sure title and category, sub_category are strictly in english/hinglish only.
2. Group items into logical "sub_category" under the main "category".
3. **CRITICAL:** Do NOT over-categorize. Do NOT create too many unnecessary small subcategories or categories. Keep the menu hierarchy clean and compact.
4. **CRITICAL:** Do NOT create duplicate categories or subcategories. If categories or subcategories are similar or matching in meaning (e.g., "Veg Starters" and "Vegetarian Starters"), MERGE them into a single category.
5. If the original category is too broad, infer a better structure, but prefer broader grouping over fragmentation.
6. **CRITICAL:** If a menu item already contains an original category itself, ALWAYS use that category. Do not use self-defined categories. If not specified, pick from the provided ones.
7. You MUST include EVERY item from the input. DO NOT skip any item.
8. You MUST preserve the exact 'id' integer provided for each item
//In case of momos i strictly want variants only based on pcs or half full not on based on fry , steam , tandoori 

You MUST output exactly one JSON object wrapped in \`\`\`json ... \`\`\`
The JSON must have the following structure:
{
  "category": [
    {
      "name": "Main category name (e.g., Rice, Breads, Chinese)",
      "sub_category": [
        {
          "name": "Sub-category name (e.g., Fried Rice, Noodles)",
          "items": [
            {
              "id": "string",
              "name": "string"
            }
          ]
        }
      ]
    }
  ]
}
`;

    const commandInput = {
        modelId: "amazon.nova-lite-v1:0",
        messages: [
            {
                role: "user",
                content: [{ text: `Here are the menu items to normalize:\n${JSON.stringify(itemsPayload, null, 2)}` }]
            }
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
            temperature: 0.1,
            topP: 0.9,
            maxTokens: 10000
        }
    };

    try {
        const command = new ConverseCommand(commandInput);
        const response = await bedrockClient.send(command);
        const content = response?.output?.message?.content || [];

        const rawResponse = content
            .map((block) => block.text || "")
            .join("\n")
            .trim();

        if (rawResponse) {
            const parsed = safeParseModelJson(rawResponse);
            return parsed;
        }

        return { category: [] };
    } catch (error) {
        console.error("AI Normalization Error:", error);
        return { error: true, message: error.message };
    }
}