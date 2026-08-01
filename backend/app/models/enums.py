from enum import Enum
class UploadType(str, Enum):
    PDF = "pdf"
    IMAGES = "images"
    CSV = "csv"
    EXCEL = "excel"
    TEXT = "text"

class JobStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    PENDING_APPROVAL = "pending_approval"
    COMPLETED = "completed"
    FAILED = "failed"

class JobType(str, Enum):
    MENU_UPLOAD = "menu_upload"
    PRICE_UPDATE = "price_update"