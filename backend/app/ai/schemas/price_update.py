from pydantic import BaseModel, Field

class ExtractedPriceItem(BaseModel):
    name: str = Field(..., description="The name of the menu item.")
    extracted_price: float = Field(..., description="The price extracted for this item from the text.")
    variant_name: str | None = Field(default=None, description="If this price is for a specific variant (e.g. 'Large'), write it here.")

class ExtractedPricesList(BaseModel):
    items: list[ExtractedPriceItem]

class MatchResult(BaseModel):
    item_id: str | None = Field(default=None, description="The exact ID of the existing menu item that matches. Leave null if no good match.")
    matched_name: str | None = Field(default=None, description="The name of the existing menu item matched.")
    old_price: float | None = Field(default=None, description="The old price from the existing item.")
    new_price: float = Field(..., description="The new price extracted from the document.")
    confidence: float = Field(..., description="Confidence score from 0.0 to 1.0 that this match is correct.")
    variant_name: str | None = Field(default=None, description="The matched variant name if applicable.")

class MappedPricesList(BaseModel):
    matches: list[MatchResult]
