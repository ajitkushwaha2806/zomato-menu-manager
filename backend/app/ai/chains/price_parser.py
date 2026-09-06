from app.ai.llms.factory import LLMFactory
from app.ai.schemas.price_update import ExtractedPricesList
from app.ai.prompts.price_parser import SYSTEM_PROMPT
from langchain_core.messages import HumanMessage, SystemMessage
from app.ai.schemas.menu_transcription import MenuTranscription

class PriceParserChain:
    def __init__(self):
        self.llm = (
            LLMFactory
            .gemini()
            .get_structured_chat_model(ExtractedPricesList)
        )

    def _build_messages(self, transcription: MenuTranscription):
        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=transcription.markdown)
        ]

    def invoke(self, transcription: MenuTranscription) -> ExtractedPricesList:
        messages = self._build_messages(transcription)
        return self.llm.invoke(messages)

    async def ainvoke(self, transcription: MenuTranscription) -> ExtractedPricesList:
        messages = self._build_messages(transcription)
        return await self.llm.ainvoke(messages)
