import logging
from app.models.enums import JobStatus
from app.utils.concurrency import run_concurrently
from app.ai.graph.state import MenuProcessingState
from app.ai.chains.menu_parser import MenuParserChain

logger = logging.getLogger(__name__)

class ParseNode:
    def __init__(self, repository):
        self.repository = repository
        self.parser_chain = MenuParserChain()

    def _parse(self, t):
        if isinstance(t, dict):
            # Skip failed/error transcriptions that don't have required fields
            if t.get("status") == "failed" or "error" in t:
                logger.warning(f"Skipping failed transcription: {t.get('error', 'unknown error')}")
                return None
            if "markdown" not in t:
                logger.warning(f"Skipping transcription missing 'markdown' field: {list(t.keys())}")
                return None
            from app.ai.schemas.menu_transcription import MenuTranscription
            t = MenuTranscription(**t)
        return self.parser_chain.invoke(t)

    def __call__(self, state: MenuProcessingState):
        job_id = state["job_id"]
        transcriptions = state.get("transcriptions", [])
        
        if not transcriptions:
            return {"parsed_menus": []}
            
        self.repository.update_progress(
            job_id,
            status=JobStatus.PROCESSING.value,
            progress=65,
            step="Parsing Menu",
        )
        
        logger.info(f"Running MenuParserChain on {len(transcriptions)} transcriptions")
        parsed_menus = run_concurrently(self._parse, transcriptions)
        # Filter out None results from skipped/failed transcriptions
        parsed_menus = [p for p in parsed_menus if p is not None]
        
        parsed_menu_dicts = [
            p.model_dump(mode="json") if hasattr(p, "model_dump") else p
            for p in parsed_menus
        ]
        self.repository.update_chain_output(job_id, "parsed_menus", parsed_menu_dicts)
        
        return {"parsed_menus": parsed_menus}
