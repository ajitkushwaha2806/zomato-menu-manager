import logging
import base64
import mimetypes
from app.ai.schemas.vision import VisionImage
from app.processor.extractors.base import BaseExtractor
from app.ai.extractors.vision import VisionExtractor

logger = logging.getLogger(__name__)

class ImageProcessor(BaseExtractor):
    def process(self, downloaded_files: list[str]):
        logger.info("Processing Image files using VisionExtractor")
        
        vision_images = []
        for file_path in downloaded_files:
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = "image/jpeg"
                
            with open(file_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                
            vision_images.append(VisionImage(mime_type=mime_type, data=encoded_string))
            
        vision_extractor = VisionExtractor()
        return vision_extractor.extract(vision_images)
