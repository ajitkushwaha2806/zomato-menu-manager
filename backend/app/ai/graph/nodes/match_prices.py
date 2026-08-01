import logging
from app.models.enums import JobStatus
from app.ai.graph.price_state import PriceUpdateState
from app.ai.chains.price_matcher import PriceMatcherChain
from app.repositories.menu_repository import MenuRepository
from app.ai.schemas.price_update import ExtractedPricesList, ExtractedPriceItem

logger = logging.getLogger(__name__)

class MatchPricesNode:
    def __init__(self, repository, menu_repository: MenuRepository):
        self.repository = repository
        self.menu_repository = menu_repository
        self.matcher_chain = PriceMatcherChain()

    def __call__(self, state: PriceUpdateState):
        job_id = state["job_id"]
        job = self.repository.get_by_job_id(job_id)
        
        extracted_prices = state.get("extracted_prices", [])
        
        if not extracted_prices:
            self.repository.update_status(job_id, JobStatus.PENDING_APPROVAL.value)
            return {"proposed_changes": []}
            
        self.repository.update_progress(
            job_id,
            status=JobStatus.PROCESSING.value,
            progress=80,
            step="Matching Prices to Menu",
        )
        
        # Fetch existing menu
        existing_menu = self.menu_repository.get_menu(job.restaurant_id, job.platform)
        
        if not existing_menu:
            logger.warning(f"No existing menu found for {job.restaurant_id} on {job.platform}")
            self.repository.update_status(job_id, JobStatus.PENDING_APPROVAL.value)
            return {"proposed_changes": []}
            
        # Reconstruct ExtractedPricesList
        extracted_items = []
        for p in extracted_prices:
            extracted_items.append(ExtractedPriceItem(**p))
        prices_list = ExtractedPricesList(items=extracted_items)
        
        # Invoke matching chain
        logger.info(f"Running PriceMatcherChain on {len(extracted_items)} items against {len(existing_menu)} existing items")
        mapped_results = self.matcher_chain.invoke(prices_list, existing_menu)
        
        # Filter only confident matches with an item_id
        valid_matches = []
        if mapped_results and mapped_results.matches:
            for match in mapped_results.matches:
                if match.item_id and match.confidence >= 0.7:
                    # Make sure old_price != new_price if possible, or include all matches
                    valid_matches.append(match.model_dump())
                    
        self.repository.update_chain_output(job_id, "proposed_changes", valid_matches)
        
        # We don't apply them automatically. We set status to PENDING_APPROVAL
        self.repository.update_progress(
            job_id,
            status=JobStatus.PENDING_APPROVAL.value,
            progress=100,
            step="Pending Approval",
        )
        
        # Update the job record to store proposed_changes
        job.proposed_changes = valid_matches
        job.status = JobStatus.PENDING_APPROVAL
        self.repository.update(job)
        
        return {"proposed_changes": valid_matches}
