from app.ai.llms.factory import LLMFactory
from app.ai.schemas.vision import VisionImage
from app.ai.prompts.menu_transcription import SYSTEM_PROMPT
from langchain_core.messages import HumanMessage, SystemMessage
from app.ai.schemas.menu_transcription import MenuTranscription

class MenuTranscriptionChain:
    def __init__(self):
        self.llm = (
            LLMFactory
            .openai()
            .get_structured_chat_model(MenuTranscription)
        )

    def _build_messages(
        self,
        images: list[VisionImage],
    ):
        content = []

        for image in images:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image.mime_type};base64,{image.data}"
                    },
                }
            )

        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=content),
        ]

    def invoke(
        self,
        images: list[VisionImage],
    ) -> MenuTranscription:
        messages = self._build_messages(images)
        return self.llm.invoke(messages)
    async def ainvoke(
        self,
        images: list[VisionImage],
    ) -> MenuTranscription:
        messages = self._build_messages(images)
        return await self.llm.ainvoke(messages)