import json
from app.ai.llms.factory import LLMFactory
from app.ai.schemas.price_update import MappedPricesList, ExtractedPricesList
from app.ai.prompts.price_matcher import SYSTEM_PROMPT
from langchain_core.messages import HumanMessage, SystemMessage

class PriceMatcherChain:
    def __init__(self):
        self.llm = (
            LLMFactory
            .bedrock()
            .get_structured_chat_model(MappedPricesList)
        )

    def _build_messages(self, extracted_prices: ExtractedPricesList, existing_menu: list[dict]):
        extracted_dicts = [item.model_dump() for item in extracted_prices.items]
        
        all_items = []
        for cat in existing_menu:
            for sub in cat.get("sub_category", []):
                for item in sub.get("items", []):
                    all_items.append(item)
                    
        # Simplify existing menu to just the necessary fields to save context window
        simplified_existing = []
        for item in all_items:
            simplified = {
                "id": item.get("id"),
                "name": item.get("name"),
                "base_price": item.get("base_price"),
            }
            if item.get("variants"):
                simplified["variants"] = []
                for variant in item.get("variants", []):
                    for option in variant.get("options", []):
                        simplified["variants"].append({
                            "property": variant.get("property_name"),
                            "name": option.get("name") or option.get("option_name"),
                            "price": option.get("price")
                        })
            simplified_existing.append(simplified)
            
        content = {
            "extracted_prices": extracted_dicts,
            "existing_menu": simplified_existing
        }

        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=json.dumps(content, indent=2))
        ]

    def invoke(self, extracted_prices: ExtractedPricesList, existing_menu: list[dict]) -> MappedPricesList:
        messages = self._build_messages(extracted_prices, existing_menu)
        return self.llm.invoke(messages)
