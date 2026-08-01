import time
import json
import traceback
from app.models.enums import JobStatus, JobType
from app.core.settings import settings
from app.services.queue.sqs import SQSService
from app.services.storage.s3 import S3StorageService
from app.processor.menu_processor import MenuProcessor
from app.processor.price_processor import PriceProcessor
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
from app.repositories.menu_repository import MenuRepository

class MenuWorker:
    def __init__(self):
        self.queue_service = SQSService()
        self.repository = MenuUploadJobRepository()
        self.menu_repository = MenuRepository()
        
        self.storage = S3StorageService(
            bucket_name=settings.AWS_S3_BUCKET,
            region=settings.AWS_REGION,
            access_key=settings.AWS_ACCESS_KEY_ID,
            secret_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        self.processor = MenuProcessor(
            repository=self.repository,
            storage=self.storage,
        )
        
        self.price_processor = PriceProcessor(
            repository=self.repository,
            menu_repository=self.menu_repository,
            storage=self.storage,
        )
        
        self.queue_url = settings.AWS_SQS_MENU_UPLOAD_QUEUE

    def start(self):
        print("Starting MenuWorker...")
        while True:
            try:
                messages = self.queue_service.receive_messages(
                    queue_url=self.queue_url,
                    max_messages=1,
                    wait_time=20
                )
                
                for message in messages:
                    self.process_message(message)
            except Exception as e:
                print(f"Worker loop error: {e}")
                time.sleep(5)
                
    def process_message(self, message):
        receipt_handle = message.get("ReceiptHandle")
        body = message.get("Body")
        
        try:
            payload = json.loads(body)
            job_id = payload.get("job_id")
            
            if not job_id:
                print("No job_id found in message payload")
                self.queue_service.delete_message(self.queue_url, receipt_handle)
                return
                
            print(f"Processing job {job_id}")
            
            job = self.repository.get_by_job_id(job_id)
            if job and job.job_type == JobType.PRICE_UPDATE:
                self.price_processor.process(job_id)
            else:
                self.processor.process(job_id)
                
            self.queue_service.delete_message(self.queue_url, receipt_handle)
            print(f"Job {job_id} completed successfully")
            
        except Exception as e:
            print(f"Error processing message: {e}")
            traceback.print_exc()
            
            try:
                payload = json.loads(body)
                job_id = payload.get("job_id")
                if job_id:
                    self.repository.update_status(job_id, JobStatus.FAILED.value)
            except Exception:
                pass
                
            self.queue_service.delete_message(self.queue_url, receipt_handle)
