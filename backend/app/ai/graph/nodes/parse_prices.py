import logging
from app.models.enums import JobStatus
from app.utils.concurrency import run_concurrently
from app.ai.graph.price_state import PriceUpdateState
from app.ai.chains.price_parser import PriceParserChain

logger = logging.getLogger(__name__)

class ParsePricesNode:
    def __init__(self, repository):
        self.repository = repository
        self.parser_chain = PriceParserChain()

    def _parse(self, t):
        if isinstance(t, dict):
            from app.ai.schemas.menu_transcription import MenuTranscription
            t = MenuTranscription(**t)
        return self.parser_chain.invoke(t)

    def __call__(self, state: PriceUpdateState):
        job_id = state["job_id"]
        transcriptions = state.get("transcriptions", [])
        
        if not transcriptions:
            return {"extracted_prices": []}
            
        self.repository.update_progress(
            job_id,
            status=JobStatus.PROCESSING.value,
            progress=50,
            step="Parsing Prices from Text",
        )
        
        logger.info(f"Running PriceParserChain on {len(transcriptions)} transcriptions")
        parsed_results = run_concurrently(self._parse, transcriptions)
        
        # Flatten all ExtractedPriceItem into a single list
        all_prices = []
        for res in parsed_results:
            if isinstance(res, dict) and "error" in res:
                continue # Skip failed extractions
            
            # res is ExtractedPricesList
            items = res.items if hasattr(res, "items") else res.get("items", [])
            for item in items:
                all_prices.append(item.model_dump() if hasattr(item, "model_dump") else item)

        self.repository.update_chain_output(job_id, "extracted_prices", all_prices)
        
        return {"extracted_prices": all_prices}
