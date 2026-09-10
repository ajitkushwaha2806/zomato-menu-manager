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
    raw_text: str | None = Form(default=None),
):
    if not restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id is required")
    if not files and not raw_text:
        raise HTTPException(status_code=400, detail="files or raw_text is required")

    job = await upload_service.create_upload_job(
        restaurant_id=restaurant_id,
        platform=platform,
        files=files,
        raw_text=raw_text,
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

@router.get("/failed-jobs", status_code=200)
async def get_failed_jobs():
    repository = MenuUploadJobRepository()
    jobs = repository.get_failed_jobs()
    return SuccessResponse(
        message="Failed jobs retrieved successfully.",
        data=[job.model_dump(mode="json") for job in jobs],
    )

@router.get("/jobs", status_code=200)
async def get_all_jobs(status: str | None = None, restaurant_id: str | None = None, limit: int = 100):
    repository = MenuUploadJobRepository()
    jobs = repository.get_all_jobs(limit=limit, status=status, restaurant_id=restaurant_id)
    return SuccessResponse(
        message="All queue jobs retrieved successfully.",
        data=[job.model_dump(mode="json") for job in jobs],
    )

@router.delete("/jobs/{job_id}", status_code=200)
async def delete_job(job_id: str):
    repository = MenuUploadJobRepository()
    deleted = repository.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")
    return SuccessResponse(
        message="Job deleted successfully.",
        data={"job_id": job_id},
    )

@router.post("/upload/{job_id}/resume", status_code=202)
async def resume_upload_job(job_id: str, background_tasks: BackgroundTasks):
    from app.services.queue.sqs import SQSService
    from app.core.settings import settings
    from app.models.enums import JobStatus, JobType
    
    repository = MenuUploadJobRepository()
    job = repository.get_by_job_id(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be resumed")

    try:
        queue = SQSService()
        queue.publish(
            queue_url=settings.AWS_SQS_MENU_UPLOAD_QUEUE,
            message={"job_id": job.job_id}
        )
    except Exception:
        pass # Handle case where SQS is not configured

    repository.update_status(job.job_id, JobStatus.QUEUED.value)
    
    def process_job_bg(job_id: str, job_type: str):
        import logging
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
            
            if job_type == JobType.PRICE_UPDATE.value:
                from app.processor.price_processor import PriceProcessor
                from app.repositories.menu_repository import MenuRepository
                menu_repository = MenuRepository()
                processor = PriceProcessor(repository, menu_repository, storage)
                processor.process(job_id)
            else:
                from app.processor.menu_processor import MenuProcessor
                processor = MenuProcessor(repository, storage)
                processor.process(job_id)
        except Exception as e:
            logging.error(f"Background task failed for job {job_id}: {e}")

    background_tasks.add_task(process_job_bg, job.job_id, job.job_type)
    
    return SuccessResponse(
        message="Job resumed successfully.",
        data={"job_id": job_id}
    )
