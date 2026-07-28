import logging
from app.models.enums import JobStatus
from app.ai.graph.state import MenuProcessingState
from app.ai.chains.semantic_normalization import SemanticNormalizationChain
from app.ai.schemas.semantic_normalization import NormalizationItem

logger = logging.getLogger(__name__)

class SemanticNormalizationNode:
    def __init__(self, repository):
        self.repository = repository
        self.chain = SemanticNormalizationChain()

    def __call__(self, state: MenuProcessingState):
        job_id = state["job_id"]
        
        self.repository.update_progress(
            job_id,
            status=JobStatus.PROCESSING.value,
            progress=95,
            step="Semantic Normalization",
        )
        
        job = self.repository.get_by_job_id(job_id)
        if not job or "merged_items" not in job.chain_outputs:
            logger.warning("No merged_items found in job for normalization")
            return {}
            
        merged_items_dict = job.chain_outputs["merged_items"]
        items = merged_items_dict.get("items", [])
        
        normalization_items = []
        for item in items:
            normalization_items.append(
                NormalizationItem(
                    id=item.get("id", ""),
                    name=item.get("name", ""),
                    category=item.get("category", ""),
                    sub_category=item.get("sub_category", "")
                )
            )
            
        logger.info(f"Running Semantic Normalization on {len(normalization_items)} items")
        response = self.chain.invoke(normalization_items)
        
        response_dict = response.model_dump(mode="json")
        
        # Merge back original item details
        original_items_map = {str(item.get("id")): item for item in items}
        
        for category in response_dict.get("category", []):
            for sub_category in category.get("sub_category", []):
                for item in sub_category.get("items", []):
                    item_id = str(item.get("id"))
                    original_item = original_items_map.get(item_id, {})
                    
                    if "base_price" in original_item:
                        item["base_price"] = original_item["base_price"]
                    if "description" in original_item:
                        item["description"] = original_item["description"]
                    if "variants" in original_item:
                        item["variants"] = original_item["variants"]
        
        self.repository.update_chain_output(
            job_id, 
            "normalized_menu", 
            response_dict
        )
        
        # Map response to expected menu schema and deep-merge
        import uuid
        import re
        
        def extract_price(val):
            if isinstance(val, (int, float)):
                return float(val)
            if not val:
                return 0.0
            match = re.search(r'\d+(?:\.\d+)?', str(val).replace(',', ''))
            return float(match.group()) if match else 0.0

        def prepare_items(items_list):
            prepared = []
            for item in items_list:
                raw_price = item.get("base_price") if item.get("base_price") is not None else item.get("price")
                final_price = extract_price(raw_price)
                
                prepared_variants = []
                for v in item.get("variants", []):
                    options = []
                    for opt in v.get("options", []):
                        opt_price = extract_price(opt.get("price"))
                        opt_name = opt.get("name") or opt.get("option_name") or ""
                        
                        new_opt = {
                            **opt,
                            "option_name": opt_name,
                            "option_id": f"temp-{uuid.uuid4()}",
                            "variant_id": f"temp-{uuid.uuid4()}",
                            "price": opt_price
                        }
                        if "name" in new_opt:
                            del new_opt["name"]
                            
                        options.append(new_opt)
                        
                    # Sort options by price (lowest first)
                    options.sort(key=lambda x: x["price"])
                    
                    # Set first option as default
                    for i, opt in enumerate(options):
                        opt["is_default"] = (i == 0)
                        
                    prepared_variants.append({
                        **v,
                        "property_id": f"temp-{uuid.uuid4()}",
                        "options": options
                    })

                if prepared_variants:
                    all_prices = []
                    for v in prepared_variants:
                        for opt in v["options"]:
                            if isinstance(opt.get("price"), (int, float)):
                                all_prices.append(opt["price"])
                    if all_prices:
                        final_price = min(all_prices)
                        
                meat_types = item.pop("meat_types", [])
                new_item = {
                    **item,
                    "id": f"temp-{uuid.uuid4()}",
                    "base_price": final_price,
                    "description": item.get("description", ""),
                    "is_available": item.get("is_available", True),
                    "variants": prepared_variants,
                    "meatTypes": meat_types
                }
                
                if "is_veg" not in new_item:
                    new_item["is_veg"] = "VEG"
                    
                new_item.pop("price", None)
                new_item.pop("min_price", None)
                new_item.pop("max_price", None)
                prepared.append(new_item)
            return prepared

        prepared_categories = []
        for cat in response_dict.get("category", []):
            sub_categories = cat.get("sub_category", [])
            
            # If a category has direct items, move them to a 'General' subcategory
            cat_items = cat.get("items", [])
            if cat_items:
                sub_categories.append({
                    "name": cat.get("name", "General"),
                    "items": cat_items
                })
                
            mapped_cat = {
                **cat,
                "id": f"temp-{uuid.uuid4()}",
                "sub_category": [],
                "items": []
            }
            
            for sub in sub_categories:
                mapped_sub = {
                    **sub,
                    "id": f"temp-{uuid.uuid4()}",
                    "items": prepare_items(sub.get("items", []))
                }
                mapped_cat["sub_category"].append(mapped_sub)
                
            prepared_categories.append(mapped_cat)

        from app.repositories.menu_repository import MenuRepository
        menu_repo = MenuRepository()
        
        # Deep merge with existing menu
        job_platform = getattr(job, 'platform', 'zomato')
        existing_menu = menu_repo.get_menu(job.restaurant_id, job_platform)
        
        for new_cat in prepared_categories:
            new_cat_name = str(new_cat.get("name", "")).lower()
            existing_cat = next(
                (c for c in existing_menu 
                 if str(c.get("name", "")).lower() == new_cat_name 
                 and str(c.get("status", "")) not in ["delete", "deleted"]),
                None
            )
            
            if existing_cat:
                if "sub_category" not in existing_cat:
                    existing_cat["sub_category"] = []
                    
                for new_sub in new_cat.get("sub_category", []):
                    new_sub_name = str(new_sub.get("name", "")).lower()
                    existing_sub = next(
                        (s for s in existing_cat["sub_category"]
                         if str(s.get("name", "")).lower() == new_sub_name
                         and str(s.get("status", "")) not in ["delete", "deleted"]),
                        None
                    )
                    
                    if existing_sub:
                        if "items" not in existing_sub:
                            existing_sub["items"] = []
                        existing_sub["items"].extend(new_sub.get("items", []))
                    else:
                        existing_cat["sub_category"].append(new_sub)
            else:
                existing_menu.append(new_cat)
                
        # Overwrite the document menu array with the fully merged menu
        menu_repo.upsert_menu(job.restaurant_id, job_platform, existing_menu, append=False)
        
        self.repository.update_status(
            job_id,
            JobStatus.COMPLETED.value,
        )
        
        return {}
