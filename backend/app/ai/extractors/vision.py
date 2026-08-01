from app.ai.schemas.vision import VisionImage
from app.utils.concurrency import run_concurrently
from app.ai.schemas.menu_transcription import MenuTranscription
from app.ai.chains.menu_transcription import MenuTranscriptionChain

class VisionExtractor:

    def __init__(self):
        self.chain = MenuTranscriptionChain()

    def _invoke_chain(self, image: VisionImage) -> MenuTranscription:
        return self.chain.invoke([image])

    def extract(
        self,
        images: list[VisionImage],
    ) -> list[MenuTranscription]:

        return run_concurrently(self._invoke_chain, images)