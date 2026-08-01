from fastapi import UploadFile
import io
import fitz  # PyMuPDF
from app.helpers.utils import Utils
from app.core.settings import settings
from app.models.enums import JobStatus
from app.models.enums import UploadType
from app.services.queue.sqs import SQSService
from app.models.uploaded_file import UploadedFile
from app.services.storage.s3 import S3StorageService
from app.models.menu_upload_job import MenuUploadJob
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository

class UploadService:
    def __init__(self):
        self.storage = S3StorageService(
            bucket_name=settings.AWS_S3_BUCKET,
            region=settings.AWS_REGION,
            access_key=settings.AWS_ACCESS_KEY_ID,
            secret_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self.utils = Utils()

    async def create_upload_job(
        self,
        restaurant_id: str,
        files: list[UploadFile] | None = None,
        raw_text: str | None = None,
        platform: str = "zomato",
        allowed_file_extension: list[str] | None = None,
        job_type: str = "menu_upload",
    ):
        files = files or []
        processed_files = []
        for file in files:
            if not file.filename:
                continue
            ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ''
            
            if allowed_file_extension and ext not in allowed_file_extension:
                from app.core.exceptions import ValidationException
                raise ValidationException(
                    message=f"File extension '{ext}' is not allowed. Allowed extensions are: {', '.join(allowed_file_extension)}."
                )

            if ext == 'pdf':
                content = await file.read()
                pdf_doc = fitz.open(stream=content, filetype="pdf")
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc.load_page(page_num)
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("jpeg")
                    
                    new_filename = f"{file.filename}_page_{page_num+1}.jpg"
                    file_like = io.BytesIO(img_bytes)
                    
                    new_upload_file = UploadFile(
                        filename=new_filename,
                        file=file_like,
                        headers={"content-type": "image/jpeg"}
                    )
                    new_upload_file.size = len(img_bytes)
                    processed_files.append(new_upload_file)
            else:
                processed_files.append(file)

        if raw_text:
            upload_type = UploadType.TEXT
            uploaded_file_models = []
            job_id = self.utils.generate_job_id()
            job = MenuUploadJob(
                job_id=job_id,
                job_type=job_type,
                restaurant_id=restaurant_id,
                platform=platform,
                upload_type=upload_type,
                status=JobStatus.PENDING,
                files=uploaded_file_models,
                total_files=0,
                raw_text=raw_text,
            )
        else:
            files = processed_files
                        
            job_id = self.utils.generate_job_id()
            uploaded_keys = await self.storage.upload_files(
                restaurant_id=restaurant_id,
                job_id=job_id,
                files=files,
            )

            uploaded_file_models = []
            for file, key in zip(files, uploaded_keys):
                uploaded_file_models.append(UploadedFile(
                    filename=file.filename or "unknown",
                    content_type=file.content_type or "application/octet-stream",
                    s3_key=key,
                    size=getattr(file, 'size', 0) or 0
                ))

            exts = [f.filename.split('.')[-1].lower() for f in uploaded_file_models if '.' in f.filename]
            
            ext_to_type = {
                "csv": UploadType.CSV,
                "xls": UploadType.EXCEL,
                "xlsx": UploadType.EXCEL,
                "pdf": UploadType.PDF,
            }
            
            upload_type = next(
                (ext_to_type[ext] for ext in exts if ext in ext_to_type), 
                UploadType.IMAGES
            )

            job = MenuUploadJob(
                job_id=job_id,
                job_type=job_type,
                restaurant_id=restaurant_id,
                platform=platform,
                upload_type=upload_type,
                status=JobStatus.PENDING,
                files=uploaded_file_models,
                total_files=len(uploaded_file_models),
            )

        repository = MenuUploadJobRepository()
        repository.create(job)

        try:
            queue = SQSService()
            queue.publish(
                queue_url=settings.AWS_SQS_MENU_UPLOAD_QUEUE,
                message={
                    "job_id": job.job_id,
                },
            )

            job.status = JobStatus.QUEUED

            repository.update_status(
                job.job_id,
                JobStatus.QUEUED.value,
            )

        except Exception:
            job.status = JobStatus.FAILED

            repository.update_status(
                job.job_id,
                JobStatus.FAILED.value,
            )

            raise

        return job