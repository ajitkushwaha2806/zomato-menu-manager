from app.ai.graph.nodes.merge import MergeNode
from app.ai.graph.nodes.parse import ParseNode
from app.ai.graph.nodes.extract import ExtractNode
from app.ai.graph.nodes.download import DownloadNode
from app.ai.graph.nodes.human_review import HumanReviewNode
from app.ai.graph.nodes.semantic_normalization import SemanticNormalizationNode
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.ai.graph.state import MenuProcessingState

def route_after_extraction(state: MenuProcessingState):
    transcriptions = state.get("transcriptions", [])
    
    needs_review = False
    for t in transcriptions:
        if isinstance(t, dict):
            score = t.get("confidence_score", 1.0)
        else:
            score = getattr(t, "confidence_score", 1.0)
            
        if score < 0.8:
            needs_review = True
            break
            
    if needs_review:
        return "human_review"
    return "parse"

def route_from_start(state: MenuProcessingState):
    if state.get("upload_type") == "text":
        return "parse"
    return "download"

def build_workflow(repository, storage):
    workflow = StateGraph(MenuProcessingState)
    
    workflow.add_node("download", DownloadNode(repository, storage))
    workflow.add_node("extract", ExtractNode(repository))
    workflow.add_node("human_review", HumanReviewNode(repository))
    workflow.add_node("parse", ParseNode(repository))
    workflow.add_node("merge", MergeNode(repository))
    workflow.add_node("normalize", SemanticNormalizationNode(repository))
    
    workflow.add_conditional_edges(
        START,
        route_from_start,
        {
            "parse": "parse",
            "download": "download"
        }
    )
    workflow.add_edge("download", "extract")
    
    workflow.add_conditional_edges(
        "extract",
        route_after_extraction,
        {
            "human_review": "human_review",
            "parse": "parse"
        }
    )
    
    workflow.add_edge("human_review", "parse")
    workflow.add_edge("parse", "merge")
    workflow.add_edge("merge", "normalize")
    workflow.add_edge("normalize", END)
    
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory, interrupt_before=["human_review"])
