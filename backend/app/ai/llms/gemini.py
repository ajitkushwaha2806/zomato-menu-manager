from typing import Type
from pydantic import BaseModel
from .base import BaseLLMProvider
from app.core.settings import settings
from langchain_google_genai import ChatGoogleGenerativeAI

class GeminiProvider(BaseLLMProvider):
    def __init__(self):
        self.model = settings.GEMINI_MODEL
        self.api_key = settings.GEMINI_API_KEY

    def get_chat_model(
        self,
        temperature: float = 0,
        model_name: str | None = None,
    ) -> ChatGoogleGenerativeAI:
        return ChatGoogleGenerativeAI(
            model=model_name or self.model,
            api_key=self.api_key,
            temperature=temperature,
        )

    def get_structured_chat_model(
        self,
        schema: Type[BaseModel],
        temperature: float = 0,
    ):
        primary = self.get_chat_model(temperature=temperature).with_structured_output(schema)
        fallback_1 = self.get_chat_model(temperature=temperature, model_name="gemini-flash-latest").with_structured_output(schema)
        fallback_2 = self.get_chat_model(temperature=temperature, model_name="gemini-2.5-flash").with_structured_output(schema)
        
        return primary.with_fallbacks([fallback_1, fallback_2])
