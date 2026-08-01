from typing import TypedDict

class PriceUpdateState(TypedDict):
    job_id: str
    temp_dir: str
    upload_type: str
    downloaded_files: list[str]
    
    # State for the workflow
    transcriptions: list[dict] # Use dict to store MenuTranscription to avoid serialization issues
    extracted_prices: list[dict] # Store ExtractedPricesList items
    proposed_changes: list[dict] # Store MatchResult items
    errors: list[str]
