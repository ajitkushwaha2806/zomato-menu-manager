import { safeParseModelJson } from "@/lib/json-parser";
import {
    BedrockRuntimeClient,
    ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
    region: "us-east-1",
});

export async function generateMenuDescriptions(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const cleanedItems = items.filter(
        (item) =>
            item &&
            item.item_id != null &&
            item.name
    );

    if (!cleanedItems.length) {
        return [];
    }

    const systemPrompt = `
You are an expert restaurant menu copywriter.

Return ONLY valid JSON.

Never wrap JSON inside markdown.
Never explain anything.
Never skip items.
`;

    const prompt = `
Generate a short menu description for EVERY item.

==========================
RULES
==========================

1. Preserve item_id EXACTLY.
2. Preserve name EXACTLY.
3. Description should be around 1 to 1.5 lines in length (1 to 2 short sentences).
4. Approximately 16-28 words (1 to 1.5 lines).
5. Natural and appetizing.
6. Never mention price.
7. Never invent variants.
8. Never skip any item.
9. Target description length is 1 to 1.5 lines (do not exceed 2 lines).

Return ONLY minified JSON.

Expected format:

{
  "items":[
    {
      "item_id":"123",
      "name":"Paneer Butter Masala",
      "description":"Soft paneer cubes simmered in a rich, buttery tomato gravy infused with aromatic spices and finished with fresh cream."
    }
  ]
}

Items:

${cleanedItems
            .map(
                (item) =>
                    `item_id: ${item.item_id}, name: ${item.name}`
            )
            .join("\n")}
`;

    try {
        const command = new ConverseCommand({
            modelId: "amazon.nova-lite-v1:0",

            system: [
                {
                    text: systemPrompt,
                },
            ],

            messages: [
                {
                    role: "user",
                    content: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],

            inferenceConfig: {
                maxTokens: 10000,
                temperature: 0.2,
            },
        });

        const response = await bedrockClient.send(command);

        const content =
            response?.output?.message?.content || [];

        console.log(
            "Nova Description Response:",
            JSON.stringify(content, null, 2)
        );

        const rawText = content
            .map((block) => block.text || "")
            .join("\n");

        try {
            const parsed = JSON.parse(rawText);

            if (Array.isArray(parsed?.items)) {
                return parsed.items;
            }
        } catch { }

        const recovered =
            safeParseModelJson(rawText);

        if (
            recovered &&
            Array.isArray(recovered.items)
        ) {
            console.log(
                "Recovered description JSON."
            );

            return recovered.items;
        }

        return [];
    } catch (error) {
        console.error(
            "Nova description generation failed:",
            error
        );

        return [];
    }
}