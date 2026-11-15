import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { safeParseModelJson } from "@/lib/json-parser";

const bedrockClient = new BedrockRuntimeClient({ region: "ap-southeast-2" });

function buildContentBlock(fileBuffer, mimeType) {
    const cleanMime = (mimeType || "").toLowerCase().split(";")[0].trim();

    if (cleanMime === "application/pdf" || cleanMime.endsWith("pdf")) {
        return {
            document: {
                name: `Menu_${Date.now()}`,
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

export async function modifyPricesWithAI(fileBuffer, mimeType, currentItemsContext = []) {
    try {
        const contentBlock = buildContentBlock(fileBuffer, mimeType);

        const promptText = `
You are an expert restaurant menu analyst.
Look at the attached menu file and match dishes to the provided item list.
Find the updated or printed price for each item.

Return valid JSON with the following structure:
{
  "updated_items": [
    {
      "id": "<matching item id from context>",
      "name": "<item name>",
      "price": <numeric price>
    }
  ]
}

Items to match:
${JSON.stringify(currentItemsContext.slice(0, 150), null, 2)}
`;

        const command = new ConverseCommand({
            modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
            messages: [
                {
                    role: "user",
                    content: [
                        contentBlock,
                        { text: promptText }
                    ]
                }
            ],
            inferenceConfig: {
                temperature: 0.1,
                maxTokens: 4096
            }
        });

        const response = await bedrockClient.send(command);
        const outputText = response.output?.message?.content?.[0]?.text || "{}";
        const parsed = safeParseModelJson(outputText);

        return parsed || { updated_items: [] };
    } catch (error) {
        console.error("modifyPricesWithAI error:", error);
        return { updated_items: [] };
    }
}

