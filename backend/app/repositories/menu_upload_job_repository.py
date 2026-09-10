from app.db.mongo_db import db
from app.models.menu_upload_job import MenuUploadJob

class MenuUploadJobRepository:
    def __init__(self):
        self.collection = db.menu_upload_jobs

    def create(
        self,
        job: MenuUploadJob,
    ) -> MenuUploadJob:

        self.collection.insert_one(
            job.model_dump(mode="json")
        )

        return job

    def get_by_job_id(
        self,
        job_id: str,
    ) -> MenuUploadJob | None:

        document = self.collection.find_one(
            {"job_id": job_id}
        )

        if document is None:
            return None

        document.pop("_id", None)

        return MenuUploadJob(**document)

    def update(
        self,
        job: MenuUploadJob,
    ):

        self.collection.update_one(
            {"job_id": job.job_id},
            {
                "$set": job.model_dump(mode="json")
            },
        )

    def update_status(
        self,
        job_id: str,
        status: str,
    ):

        self.collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": status
                }
            },
        )

    def update_progress(
        self,
        job_id: str,
        status: str,
        progress: int,
        step: str,
    ):
        self.collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": status,
                    "progress": progress,
                    "step": step,
                }
            },
        )

    def mark_failed(
        self,
        job_id: str,
        error: str,
    ):
        from app.models.enums import JobStatus
        self.collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": JobStatus.FAILED.value,
                    "error": error,
                }
            },
        )

    def update_chain_output(self, job_id: str, step_name: str, output_data: dict | list | str):
        self.collection.update_one(
            {"job_id": job_id},
            {"$set": {f"chain_outputs.{step_name}": output_data}}
        )

    def get_failed_jobs(self) -> list[MenuUploadJob]:
        from app.models.enums import JobStatus
        cursor = self.collection.find({"status": JobStatus.FAILED.value}).sort("created_at", -1)
        jobs = []
        for document in cursor:
            document.pop("_id", None)
            jobs.append(MenuUploadJob(**document))
        return jobs

    def get_all_jobs(self, limit: int = 100, status: str | None = None, restaurant_id: str | None = None) -> list[MenuUploadJob]:
        query = {}
        if status and status != "all":
            query["status"] = status
        if restaurant_id:
            query["restaurant_id"] = restaurant_id

        cursor = self.collection.find(query).sort("created_at", -1).limit(limit)
        jobs = []
        for document in cursor:
            document.pop("_id", None)
            jobs.append(MenuUploadJob(**document))
        return jobs

    def delete_job(self, job_id: str) -> bool:
        result = self.collection.delete_one({"job_id": job_id})
        return result.deleted_count > 0