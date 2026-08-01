from langgraph.graph import StateGraph, START, END
from app.ai.graph.price_state import PriceUpdateState
from app.ai.graph.nodes.download import DownloadNode
from app.ai.graph.nodes.extract import ExtractNode
from app.ai.graph.nodes.parse_prices import ParsePricesNode
from app.ai.graph.nodes.match_prices import MatchPricesNode
from app.repositories.menu_upload_job_repository import MenuUploadJobRepository
from app.repositories.menu_repository import MenuRepository
from app.services.storage.s3 import S3StorageService
from langgraph.checkpoint.memory import MemorySaver

def build_price_workflow(
    job_repository: MenuUploadJobRepository,
    menu_repository: MenuRepository,
    storage: S3StorageService
):
    workflow = StateGraph(PriceUpdateState)

    download_node = DownloadNode(job_repository, storage)
    extract_node = ExtractNode(job_repository)
    parse_prices_node = ParsePricesNode(job_repository)
    match_prices_node = MatchPricesNode(job_repository, menu_repository)

    workflow.add_node("download", download_node)
    workflow.add_node("extract", extract_node)
    workflow.add_node("parse_prices", parse_prices_node)
    workflow.add_node("match_prices", match_prices_node)

    def route_from_start(state: PriceUpdateState):
        if state.get("upload_type") == "text":
            return "parse_prices"
        return "download"

    workflow.add_conditional_edges(
        START,
        route_from_start,
        {
            "parse_prices": "parse_prices",
            "download": "download"
        }
    )

    workflow.add_edge("download", "extract")
    workflow.add_edge("extract", "parse_prices")
    workflow.add_edge("parse_prices", "match_prices")
    workflow.add_edge("match_prices", END)

    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)
