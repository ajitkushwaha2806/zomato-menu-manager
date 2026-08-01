import logging
import tempfile
from app.services.storage.s3 import S3StorageService
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
from app.repositories.menu_repository import MenuRepository
from app.ai.graph.price_workflow import build_price_workflow

logger = logging.getLogger(__name__)

class PriceProcessor:
    def __init__(
        self,
        repository: MenuUploadJobRepository,
        menu_repository: MenuRepository,
        storage: S3StorageService,
    ):
        self.repository = repository
        self.storage = storage
        self.graph = build_price_workflow(repository, menu_repository, storage)

    def process(self, job_id: str):
        job = self.repository.get_by_job_id(job_id)

        if not job:
            raise ValueError(f"Job {job_id} not found.")

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                from app.ai.schemas.menu_transcription import MenuTranscription

                initial_transcriptions = []
                if job.upload_type == "text" and job.raw_text:
                    initial_transcriptions = [
                        MenuTranscription(
                            markdown=job.raw_text,
                            confidence_score=1.0,
                            confidence_reasoning="Raw text provided by user"
                        )
                    ]

                initial_state = {
                    "job_id": job_id,
                    "temp_dir": temp_dir,
                    "upload_type": job.upload_type,
                    "downloaded_files": [],
                    "transcriptions": initial_transcriptions,
                    "extracted_prices": [],
                    "proposed_changes": [],
                    "errors": []
                }
                
                from app.models.enums import JobStatus
                self.repository.update_progress(
                    job_id=job_id,
                    status=JobStatus.PROCESSING.value,
                    progress=5,
                    step="Initializing workflow..."
                )
                
                self.graph.invoke(
                    initial_state,
                    config={"configurable": {"thread_id": job_id}}
                )

        except Exception as e:
            logger.error("Job %s failed: %s", job_id, str(e), exc_info=True)
            self.repository.mark_failed(
                job_id=job_id,
                error=str(e),
            )
            raise
