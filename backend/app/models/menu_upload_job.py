from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import JobStatus, UploadType, JobType
from app.models.uploaded_file import UploadedFile

class MenuUploadJob(BaseModel):
    job_id: str
    job_type: JobType = JobType.MENU_UPLOAD
    restaurant_id: str
    upload_type: UploadType
    platform: str = "zomato"
    status: JobStatus = JobStatus.QUEUED
    files: list[UploadedFile] = []
    total_files: int = 0
    raw_text: str | None = None
    proposed_changes: list[dict] = Field(default_factory=list, description="For PRICE_UPDATE jobs, holds the diff.")
    created_at: datetime = Field(
        default_factory=datetime.utcnow
    )

    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None

    progress: int | None = None
    step: str | None = None

    chain_outputs: dict = Field(default_factory=dict, description="Outputs from various AI chain steps")