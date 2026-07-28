from fastapi import HTTPException
from app.core.responses import SuccessResponse
from fastapi import APIRouter, File, Form, UploadFile, WebSocket, WebSocketDisconnect, BackgroundTasks
from app.services.upload_service import UploadService
from app.helpers.validators import validate_required_fields
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
import httpx

router = APIRouter(prefix="/api/menu", tags=["Menu"])

upload_service = UploadService()

@router.post("/upload", status_code=202)
async def upload_menu(
    background_tasks: BackgroundTasks,
    restaurant_id: str | None = Form(default=None),
    platform: str | None = Form(default="zomato"),
    files: list[UploadFile] | None = File(default=None),
):
    validate_required_fields(
        restaurant_id=restaurant_id,
        files=files
    )

    job = await upload_service.create_upload_job(
        restaurant_id=restaurant_id,
        platform=platform,
        files=files,
        allowed_file_extension=["pdf", "csv", "jpeg", "jpg", "webp", "png"],
    )

    def process_job_bg(job_id: str):
        import logging
        from app.processor.menu_processor import MenuProcessor
        from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
        from app.services.storage.s3 import S3StorageService
        from app.core.settings import settings

        try:
            repository = MenuUploadJobRepository()
            storage = S3StorageService(
                bucket_name=settings.AWS_S3_BUCKET,
                region=settings.AWS_REGION,
                access_key=settings.AWS_ACCESS_KEY_ID,
                secret_key=settings.AWS_SECRET_ACCESS_KEY,
            )
            processor = MenuProcessor(repository, storage)
            processor.process(job_id)
        except Exception as e:
            logging.error(f"Background task failed for job {job_id}: {e}")

    background_tasks.add_task(process_job_bg, job.job_id)

    return SuccessResponse(
        message="Files uploaded successfully.",
        data=job.model_dump(mode="json"),
    )

@router.get("/upload/{job_id}", status_code=200)
async def get_upload_status(job_id: str):    
    repository = MenuUploadJobRepository()
    job = repository.get_by_job_id(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return SuccessResponse(
        message="Job status retrieved successfully.",
        data=job.model_dump(mode="json"),
    )
