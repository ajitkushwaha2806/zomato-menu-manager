from app.ai.llms.factory import LLMFactory
from app.ai.schemas.menu_parser import ParsedMenu
from app.ai.prompts.menu_parser import SYSTEM_PROMPT
from langchain_core.messages import HumanMessage, SystemMessage
from app.ai.schemas.menu_transcription import MenuTranscription


class MenuParserChain:

    def __init__(self):
        self.llm = (
            LLMFactory
            .openai()
            .get_structured_chat_model(
                ParsedMenu
            )
        )

    def _build_messages(
        self,
        transcription: MenuTranscription,
    ):
        return [

            SystemMessage(
                content=SYSTEM_PROMPT
            ),

            HumanMessage(
                content=transcription.markdown
            )

        ]

    def invoke(
        self,
        transcription: MenuTranscription,
    ) -> ParsedMenu:
        messages = self._build_messages(
            transcription
        )

        return self.llm.invoke(messages)

    async def ainvoke(
        self,
        transcription: MenuTranscription,
    ) -> ParsedMenu:
        messages = self._build_messages(
            transcription
        )

        return await self.llm.ainvoke(messages)