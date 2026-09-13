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
        
        import time
        batch_size = 25
        all_categories = []
        
        for i in range(0, len(normalization_items), batch_size):
            batch = normalization_items[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(normalization_items) + batch_size - 1)//batch_size} with {len(batch)} items")
            
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = self.chain.invoke(batch)
                    batch_response_dict = response.model_dump(mode="json")
                    break
                except Exception as e:
                    error_msg = str(e).lower()
                    if "429" in error_msg or "rate limit" in error_msg:
                        if attempt < max_retries - 1:
                            logger.warning(f"Rate limit hit on batch {i//batch_size + 1}. Waiting 15 seconds before retry {attempt + 1}/{max_retries}...")
                            time.sleep(15)
                        else:
                            logger.error(f"Failed to process batch {i//batch_size + 1} after {max_retries} attempts due to rate limit.")
                            raise e
                    else:
                        raise e
            
            all_categories.extend(batch_response_dict.get("category", []))
            
            if i + batch_size < len(normalization_items):
                time.sleep(10)  # Wait 10 seconds between batches to avoid rate limits
                
        response_dict = {"category": all_categories}
        
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
        
        KNOWN_CANONICAL_NAMES = {
            ("paneer", "shahi"): "Shahi Paneer",
            ("kadai", "paneer"): "Kadai Paneer",
            ("kadhai", "paneer"): "Kadai Paneer",
            ("butter", "chicken"): "Butter Chicken",
            ("dal", "makhani"): "Dal Makhani",
            ("matar", "paneer"): "Matar Paneer",
            ("mutter", "paneer"): "Matar Paneer",
            ("palak", "paneer"): "Palak Paneer",
            ("handi", "paneer"): "Handi Paneer",
            ("lababdar", "paneer"): "Paneer Lababdar",
            ("do", "paneer", "pyaza"): "Paneer Do Pyaza",
            ("curry", "egg"): "Egg Curry",
            ("curry", "chicken"): "Chicken Curry",
            ("curry", "mutton"): "Mutton Curry",
            ("paneer", "tikka"): "Paneer Tikka",
            ("chicken", "tikka"): "Chicken Tikka",
        }

        def resolve_canonical_name(name: str) -> str:
            if not name or not isinstance(name, str):
                return name
            cleaned = " ".join(name.strip().split())
            words = tuple(sorted(re.findall(r'\b[a-zA-Z]+\b', cleaned.lower())))
            if words in KNOWN_CANONICAL_NAMES:
                return KNOWN_CANONICAL_NAMES[words]
            return cleaned

        def get_canonical_key(name: str) -> str:
            resolved = resolve_canonical_name(name)
            words = sorted(re.findall(r'\b[a-zA-Z0-9]+\b', resolved.lower()))
            return " ".join(words)

        def extract_price(val):
            if isinstance(val, (int, float)):
                return float(val)
            if not val:
                return 0.0
            cleaned_str = str(val).replace(',', '').replace('/-', '')
            match = re.search(r'\d+(?:\.\d+)?', cleaned_str)
            return float(match.group()) if match else 0.0

        def title_case(text):
            """Proper title case: first letter cap, rest lowercase for each word."""
            if not text or not isinstance(text, str):
                return text
            cleaned = " ".join(text.strip().split())
            return " ".join(w.capitalize() for w in cleaned.split(" "))

        def normalize_option_name(name: str) -> str:
            """Normalize variant option names for dedup (e.g. '6 piece' == '6 pieces' == '6 pcs')."""
            if not name:
                return ""
            n = name.lower().strip()
            n = re.sub(r'\s+', ' ', n)
            # Normalize piece/pieces/pcs variations
            n = re.sub(r'\bpieces?\b', 'pcs', n)
            n = re.sub(r'\bpcs\.?\b', 'pcs', n)
            return n

        def prepare_items(items_list, seen_keys):
            prepared = []
            for item in items_list:
                raw_price = item.get("base_price") if item.get("base_price") is not None else item.get("price")
                final_price = extract_price(raw_price)
                
                prepared_variants = []
                for v in item.get("variants", []):
                    options = []
                    seen_option_names = set()
                    for opt in v.get("options", []):
                        opt_price = extract_price(opt.get("price"))
                        opt_name = opt.get("name") or opt.get("option_name") or ""
                        
                        # Deduplicate options by normalized name (e.g. "6 piece" and "6 pieces")
                        norm_name = normalize_option_name(opt_name)
                        if norm_name in seen_option_names:
                            continue
                        seen_option_names.add(norm_name)
                        
                        new_opt = {
                            **opt,
                            "option_name": title_case(opt_name),
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
                        
                    # Only keep variant groups with 2+ unique options
                    if len(options) >= 2:
                        prepared_variants.append({
                            **v,
                            "property_name": title_case(v.get("property_name", "")),
                            "property_id": f"temp-{uuid.uuid4()}",
                            "options": options
                        })
                    elif len(options) == 1:
                        # Single-option variant: collapse into item name + base_price
                        single_opt = options[0]
                        opt_label = single_opt.get("option_name", "")
                        item_name_str = str(item.get("name", ""))
                        if opt_label and opt_label.lower() not in item_name_str.lower():
                            item["name"] = f"{item_name_str} - [{opt_label}]"
                        if single_opt.get("price"):
                            item["base_price"] = single_opt["price"]
                            final_price = single_opt["price"]

                if prepared_variants:
                    all_prices = []
                    for v in prepared_variants:
                        for opt in v["options"]:
                            if isinstance(opt.get("price"), (int, float)):
                                all_prices.append(opt["price"])
                    if all_prices:
                        final_price = min(all_prices)
                        
                meat_types = item.pop("meat_types", [])
                item_name = resolve_canonical_name(str(item.get("name", "")))
                new_item = {
                    **item,
                    "name": item_name,
                    "id": f"temp-{uuid.uuid4()}",
                    "base_price": final_price,
                    "description": item.get("description", ""),
                    "is_available": item.get("is_available", True),
                    "variants": prepared_variants,
                    "meatTypes": meat_types
                }
                
                if "is_veg" not in new_item:
                    new_item["is_veg"] = "VEG"

                # Force chaap items to always be VEG (soy chaap, malai chaap, etc.)
                if re.search(r'\bchaap\b', item_name, re.IGNORECASE):
                    new_item["is_veg"] = "VEG"
                    new_item["meatTypes"] = []
                    
                new_item.pop("price", None)
                new_item.pop("min_price", None)
                new_item.pop("max_price", None)
                
                # Check for global intra-upload duplicates using canonical key
                item_key = get_canonical_key(item_name)
                if item_key not in seen_keys:
                    seen_keys.add(item_key)
                    prepared.append(new_item)
            return prepared

        prepared_categories = []
        global_seen_keys = set()
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
                "name": title_case(cat.get("name", "")),
                "id": f"temp-{uuid.uuid4()}",
                "sub_category": [],
                "items": []
            }
            
            for sub in sub_categories:
                mapped_sub = {
                    **sub,
                    "name": title_case(sub.get("name", "")),
                    "id": f"temp-{uuid.uuid4()}",
                    "items": prepare_items(sub.get("items", []), global_seen_keys)
                }
                mapped_cat["sub_category"].append(mapped_sub)
                
            prepared_categories.append(mapped_cat)

        # POST-PROCESSING: Merge orphan single-item categories
        # If a category has only 1 subcategory with only 1 item, and the category name
        # looks like an item name (same as the item or the subcategory), it's likely
        # the AI treated an item as its own category. Merge such orphans into a shared parent.
        def count_items_in_cat(cat):
            return sum(len(s.get("items", [])) for s in cat.get("sub_category", []))

        final_categories = []
        orphan_items = []  # items from orphan categories to be merged

        for cat in prepared_categories:
            total_items = count_items_in_cat(cat)
            subs = cat.get("sub_category", [])

            if total_items <= 1 and len(subs) <= 1:
                # This is an orphan category (1 sub, 1 item) — collect its items
                for sub in subs:
                    for item in sub.get("items", []):
                        # Preserve the original category/sub_category from the item for grouping
                        item["_original_category"] = cat.get("name", "")
                        orphan_items.append(item)
            else:
                final_categories.append(cat)

        if orphan_items:
            # Group orphans by their original parser-assigned category if available,
            # otherwise try to find a common prefix pattern
            from collections import defaultdict
            orphan_groups = defaultdict(list)

            for item in orphan_items:
                # Use the item's original category from the parser (before normalization mangled it)
                orig_cat = item.get("category", "") or item.get("_original_category", "")
                # Strip trailing digits/numbers to find common base name
                # e.g. "Combo 1", "Combo 2" -> "Combo"
                base_name = re.sub(r'\s*\d+\s*$', '', orig_cat).strip()
                if not base_name:
                    base_name = "Uncategorized"
                # Clean up the marker
                item.pop("_original_category", None)
                orphan_groups[base_name].append(item)

            for group_name, items in orphan_groups.items():
                # Check if a matching category already exists
                cat_name = title_case(group_name)
                # Pluralize simple names (Combo -> Combos) if not already plural
                if not cat_name.endswith("s") and len(items) > 1:
                    cat_name = cat_name + "s"

                existing_cat = next(
                    (c for c in final_categories if c.get("name", "").lower() == cat_name.lower()),
                    None
                )

                if existing_cat:
                    # Merge into existing category's first subcategory
                    if existing_cat["sub_category"]:
                        existing_cat["sub_category"][0]["items"].extend(items)
                    else:
                        existing_cat["sub_category"].append({
                            "name": cat_name,
                            "id": f"temp-{uuid.uuid4()}",
                            "items": items
                        })
                else:
                    # Create new category with all orphans grouped
                    final_categories.append({
                        "name": cat_name,
                        "id": f"temp-{uuid.uuid4()}",
                        "sub_category": [{
                            "name": cat_name,
                            "id": f"temp-{uuid.uuid4()}",
                            "items": items
                        }],
                        "items": []
                    })

        prepared_categories = final_categories

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
                            
                        for new_item in new_sub.get("items", []):
                            new_key = get_canonical_key(str(new_item.get("name", "")))
                            existing_item = next(
                                (item for item in existing_sub["items"] 
                                 if get_canonical_key(str(item.get("name", ""))) == new_key
                                 and str(item.get("status", "")) not in ["delete", "deleted"]),
                                None
                            )
                            if existing_item:
                                # Update existing item fields
                                if new_item.get("base_price") is not None:
                                    existing_item["base_price"] = new_item["base_price"]
                                if new_item.get("description"):
                                    existing_item["description"] = new_item["description"]
                                if new_item.get("variants"):
                                    existing_item["variants"] = new_item["variants"]
                                if new_item.get("meatTypes"):
                                    existing_item["meatTypes"] = new_item["meatTypes"]
                            else:
                                existing_sub["items"].append(new_item)
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
