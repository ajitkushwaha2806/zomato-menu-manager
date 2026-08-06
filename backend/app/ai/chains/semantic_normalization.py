import json
from app.ai.llms.factory import LLMFactory
from app.ai.schemas.semantic_normalization import NormalizationResponse, NormalizationItem
from app.ai.prompts.semantic_normalization import SYSTEM_PROMPT
from langchain_core.messages import HumanMessage, SystemMessage

class SemanticNormalizationChain:
    def __init__(self):
        self.llm = (
            LLMFactory
            .openai()
            .get_structured_chat_model(
                NormalizationResponse
            )
        )

    def _build_messages(
        self,
        items: list[NormalizationItem],
    ):
        items_dicts = [item.model_dump() for item in items]
        return [
            SystemMessage(
                content=SYSTEM_PROMPT
            ),
            HumanMessage(
                content=json.dumps(items_dicts, indent=2)
            )
        ]

    def invoke(
        self,
        items: list[NormalizationItem],
    ) -> NormalizationResponse:
        messages = self._build_messages(items)
        return self.llm.invoke(messages)

    async def ainvoke(
        self,
        items: list[NormalizationItem],
    ) -> NormalizationResponse:
        messages = self._build_messages(items)
        return await self.llm.ainvoke(messages)
