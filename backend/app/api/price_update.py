import logging
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, BackgroundTasks
from app.core.responses import SuccessResponse
from app.services.upload_service import UploadService
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
from app.repositories.menu_repository import MenuRepository
from app.models.enums import JobType, JobStatus

router = APIRouter(prefix="/api/menu/price-update", tags=["Menu Price Update"])
upload_service = UploadService()

@router.post("/upload", status_code=202)
async def upload_price_update(
    background_tasks: BackgroundTasks,
    restaurant_id: str | None = Form(default=None),
    platform: str | None = Form(default="zomato"),
    files: list[UploadFile] | None = File(default=None),
    raw_text: str | None = Form(default=None),
    existing_menu: str | None = Form(default=None),
):
    if not restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id is required")
    if not files and not raw_text:
        raise HTTPException(status_code=400, detail="files or raw_text is required")
        
    if existing_menu:
        import json
        try:
            menu_data = json.loads(existing_menu)
            menu_repo = MenuRepository()
            menu_repo.upsert_menu(restaurant_id, platform, menu_data, append=False)
        except Exception as e:
            logging.error(f"Failed to cache existing menu: {e}")

    job = await upload_service.create_upload_job(
        restaurant_id=restaurant_id,
        platform=platform,
        files=files,
        raw_text=raw_text,
        allowed_file_extension=["pdf", "csv", "jpeg", "jpg", "webp", "png"],
        job_type=JobType.PRICE_UPDATE.value,
    )

    def process_job_bg(job_id: str):
        import logging
        from app.processor.price_processor import PriceProcessor
        from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
        from app.repositories.menu_repository import MenuRepository
        from app.services.storage.s3 import S3StorageService
        from app.core.settings import settings

        try:
            repository = MenuUploadJobRepository()
            menu_repository = MenuRepository()
            storage = S3StorageService(
                bucket_name=settings.AWS_S3_BUCKET,
                region=settings.AWS_REGION,
                access_key=settings.AWS_ACCESS_KEY_ID,
                secret_key=settings.AWS_SECRET_ACCESS_KEY,
            )
            processor = PriceProcessor(repository, menu_repository, storage)
            processor.process(job_id)
        except Exception as e:
            logging.error(f"Background task failed for job {job_id}: {e}")

    background_tasks.add_task(process_job_bg, job.job_id)

    return SuccessResponse(
        message="Files uploaded successfully. Price update job created.",
        data=job.model_dump(mode="json"),
    )

@router.get("/{job_id}", status_code=200)
async def get_price_update_status(job_id: str):
    repository = MenuUploadJobRepository()
    job = repository.get_by_job_id(job_id)
    
    if not job or job.job_type != JobType.PRICE_UPDATE.value:
        raise HTTPException(status_code=404, detail="Price update job not found")
        
    return SuccessResponse(
        message="Job status retrieved successfully.",
        data=job.model_dump(mode="json"),
    )

@router.post("/{job_id}/apply", status_code=200)
async def apply_price_updates(job_id: str):
    repository = MenuUploadJobRepository()
    menu_repository = MenuRepository()
    
    job = repository.get_by_job_id(job_id)
    if not job or job.job_type != JobType.PRICE_UPDATE.value:
        raise HTTPException(status_code=404, detail="Price update job not found")
        
    if job.status != JobStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Job is not in PENDING_APPROVAL status")
        
    if not job.proposed_changes:
        raise HTTPException(status_code=400, detail="No proposed changes found for this job")
        
    # Fetch existing menu
    existing_menu = menu_repository.get_menu(job.restaurant_id, job.platform)
    
    if not existing_menu:
        raise HTTPException(status_code=404, detail="Restaurant menu not found")
        
    # Apply changes
    changes_count = 0
    for change in job.proposed_changes:
        target_id = change.get("item_id")
        new_price = change.get("new_price")
        variant_name = change.get("variant_name")
        
        for cat in existing_menu:
            for sub in cat.get("sub_category", []):
                for item in sub.get("items", []):
                    if item.get("id") == target_id:
                        if variant_name:
                            # Update variant price
                            for variant in item.get("variants", []):
                                for option in variant.get("options", []):
                                    if option.get("name") == variant_name or option.get("option_name") == variant_name:
                                        option["price"] = str(new_price)
                                        changes_count += 1
                        else:
                            item["base_price"] = str(new_price)
                            changes_count += 1

    # Save to db
    menu_repository.upsert_menu(job.restaurant_id, job.platform, existing_menu, append=False)
    
    # Mark job complete
    repository.update_status(job_id, JobStatus.COMPLETED.value)
    
    return SuccessResponse(
        message=f"Successfully applied {changes_count} price updates.",
        data={"changes_applied": changes_count}
    )
