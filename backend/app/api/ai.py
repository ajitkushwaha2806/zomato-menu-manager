from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from app.ai.llms.factory import LLMFactory
from app.core.responses import SuccessResponse
from langchain_core.messages import SystemMessage, HumanMessage
import json

router = APIRouter(prefix="/api/menu/ai", tags=["AI"])

class ItemInput(BaseModel):
    item_id: str
    name: str
    is_veg: Optional[str] = None

class DescriptionRequest(BaseModel):
    items: List[ItemInput]

class ItemDescription(BaseModel):
    item_id: str
    name: str
    description: str

class DescriptionResponse(BaseModel):
    items: List[ItemDescription]

@router.post("/description")
async def generate_descriptions(request: DescriptionRequest):
    system_prompt = """
You are an expert restaurant menu copywriter.

Return ONLY valid JSON.

Never wrap JSON inside markdown.
Never explain anything.
Never skip items.
"""

    prompt = f"""
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

{{
  "items":[
    {{
      "item_id":"123",
      "name":"Paneer Butter Masala",
      "description":"Soft paneer cubes simmered in a rich, buttery tomato gravy infused with aromatic spices and finished with fresh cream."
    }}
  ]
}}

Items:
{request.model_dump_json()}
"""

    llm = LLMFactory.bedrock().get_structured_chat_model(schema=DescriptionResponse, temperature=0.7)
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=prompt)
    ]
    
    response = llm.invoke(messages)
    
    return SuccessResponse(
        message="Descriptions generated successfully.",
        data=response.model_dump()
    )
