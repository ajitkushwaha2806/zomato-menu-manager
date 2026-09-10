import logging
from app.models.enums import JobStatus
from app.ai.graph.state import MenuProcessingState

logger = logging.getLogger(__name__)

class MergeNode:
    def __init__(self, repository):
        self.repository = repository

    def __call__(self, state: MenuProcessingState):
        job_id = state["job_id"]
        
        self.repository.update_progress(
            job_id,
            status=JobStatus.PROCESSING.value,
            progress=90,
            step="Saving Menu",
        )
        
        parsed_menus = state.get("parsed_menus", [])
        all_items = []
        item_counter = 1
        
        for pm in parsed_menus:
            if isinstance(pm, dict):
                items = pm.get("items", [])
            else:
                items = getattr(pm, "items", [])
                
            for item in items:
                if hasattr(item, "model_dump"):
                    item_dict = item.model_dump(mode="json")
                else:
                    item_dict = item
                    
                def normalize(text):
                    if not text or not isinstance(text, str):
                        return text
                    cleaned = " ".join(text.strip().split())
                    words = cleaned.split(" ")
                    capitalized_words = []
                    for w in words:
                        if w.isupper() and len(w) > 1:
                            capitalized_words.append(w)
                        else:
                            capitalized_words.append(w.capitalize())
                    return " ".join(capitalized_words)
                    
                item_dict["name"] = normalize(item_dict.get("name"))
                item_dict["category"] = normalize(item_dict.get("category"))
                item_dict["sub_category"] = normalize(item_dict.get("sub_category"))
                
                if not item_dict.get("sub_category"):
                    item_dict["sub_category"] = item_dict.get("category")
                    
                item_dict["id"] = str(item_counter)
                item_counter += 1
                
                all_items.append(item_dict)
                    
        merged_items = {"items": all_items}
        self.repository.update_chain_output(job_id, "merged_items", merged_items)
        return {}
