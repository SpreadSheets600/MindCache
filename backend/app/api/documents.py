from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DocumentNotFoundError, MindCacheException
from app.core.logging import get_logger
from app.db.session import get_db
from app.models.document import Entity, Keyword
from app.repositories.document_repository import document_repository
from app.schemas.document import DocumentResponse, EntityResponse, KeywordResponse
from app.services.bm25_service import bm25_service
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service

router = APIRouter(tags=["Document Management"])
logger = get_logger(__name__)


@router.get(
    "/documents",
    response_model=list[DocumentResponse],
    status_code=200,
    summary="list Stored Documents",
)
async def list_documents(
    skip: int = Query(0, ge=0, description="Number Of Documents to Skip."),
    limit: int = Query(20, ge=1, le=100, description="Max Number Of Documents To Return."),
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[DocumentResponse]:
    """Retrieves All Indexed Browser Memory Documents Ordered By Last Updated Timestamp."""

    try:
        documents = await document_repository.list_documents(db, skip=skip, limit=limit)

        response_list = []
        for doc in documents:
            keywords_res = [
                KeywordResponse(keyword=kw.keyword, score=kw.score)
                for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
            ]
            entities_res = [
                EntityResponse(name=e.name, type=e.type)
                for e in doc.entities
            ]
            visit_res = [visit.visited_at for visit in sorted(doc.visits, key=lambda v: v.visited_at)]

            response_list.append(
                DocumentResponse(
                    id=doc.id,
                    url=doc.url,
                    domain=doc.domain,
                    title=doc.title,
                    author=doc.author,
                    published_date=doc.published_date,
                    extracted_content=doc.extracted_content,
                    source_type=doc.source_type,
                    platform_metadata=doc.platform_metadata,
                    summary=doc.summary,
                    created_at=doc.created_at,
                    updated_at=doc.updated_at,
                    keywords=keywords_res,
                    entities=entities_res,
                    total_dwell_time=doc.total_dwell_time,
                    visit_history=visit_res,
                )
            )
        return response_list
    except Exception as e:
        logger.error(f"Failed To List Documents : {e}", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail="Failed To Retrieve Document Listing.",
        ) from e


@router.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    status_code=200,
    summary="Get Document Details By ID",
)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> DocumentResponse:
    """Retrieves The Full Extracted Content, Metadata, Keyword List, And Visit History Of A Single Page."""

    try:
        doc = await document_repository.get_by_id(db, document_id)

        if not doc:
            raise DocumentNotFoundError(document_id)

        keywords_res = [
            KeywordResponse(keyword=kw.keyword, score=kw.score)
            for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
        ]

        entities_res = [
            EntityResponse(name=e.name, type=e.type)
            for e in doc.entities
        ]

        visit_res = [visit.visited_at for visit in sorted(doc.visits, key=lambda v: v.visited_at)]

        return DocumentResponse(
            id=doc.id,
            url=doc.url,
            domain=doc.domain,
            title=doc.title,
            author=doc.author,
            published_date=doc.published_date,
            extracted_content=doc.extracted_content,
            source_type=doc.source_type,
            platform_metadata=doc.platform_metadata,
            summary=doc.summary,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            keywords=keywords_res,
            entities=entities_res,
            visit_history=visit_res,
        )
    except MindCacheException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Error Fetching Document ID {document_id} : {e}", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail="Failed To Retrieve Document Details.",
        ) from e


@router.delete(
    "/documents/{document_id}",
    status_code=200,
    summary="Delete A Document",
)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Deletes A Webpage's Database Record ( SQLite Cascading Keywords And Visits ) And Clears Its FAISS Vector."""

    try:
        # Delete From SQLite DB
        deleted = await document_repository.delete(db, document_id)

        if not deleted:
            raise DocumentNotFoundError(document_id)

        # Commit SQLite Transaction First So FAISS Deletion Only Occurs if DB Delete Succeeds
        await db.commit()

        # Delete Vector From FAISS Index And BM25 Index
        vector_service.delete_document(document_id)
        bm25_service.remove_document(document_id)

        return {"message": f"Document ID {document_id} Was Successfully Deleted From Local Memory."}

    except MindCacheException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Error Deleting Document ID {document_id} : {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed To Delete Document.",
        ) from e


@router.post(
    "/documents/{document_id}/summarize",
    status_code=200,
    summary="Generate AI Summary For Document",
)
async def summarize_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Generates An AI Summary For An Existing Document Using Ollama."""

    try:
        doc = await document_repository.get_by_id(db, document_id)

        if not doc:
            raise DocumentNotFoundError(document_id)

        if not await ollama_service.check_health():
            raise HTTPException(
                status_code=503,
                detail="Ollama service is offline. Cannot generate summary.",
            )

        logger.info(f"Generating AI summary for Document ID {document_id}...")
        summary = await ollama_service.generate_summary(doc.extracted_content[:8000])

        if summary:
            await document_repository.update_summary(db, document_id, summary)
            await db.commit()
            return {"message": "Summary generated successfully.", "summary": summary}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate summary from Ollama.",
            )

    except MindCacheException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error Generating Summary For Document ID {document_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate summary.",
        ) from e


@router.get(
    "/graph",
    status_code=200,
    summary="Get Knowledge Graph Data",
)
async def get_graph_data(
    limit: int = Query(100, ge=1, le=500, description="Maximum number of documents to include."),
    min_keyword_freq: int = Query(2, ge=1, le=10, description="Minimum keyword frequency to include."),
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Returns entities, keywords, and relationships for knowledge graph visualization."""

    try:
        # Fetch documents with preloaded relationships
        documents = await document_repository.list_documents(db, skip=0, limit=limit)

        # Build entity aggregation
        entity_map: dict[str, dict] = {}
        # Build keyword aggregation
        keyword_map: dict[str, dict] = {}
        # Build document nodes
        doc_nodes = []
        # Build edges
        edges = []

        for doc in documents:
            doc_id = f"doc_{doc.id}"
            doc_nodes.append({
                "id": doc_id,
                "label": doc.title or doc.url,
                "type": "document",
                "url": doc.url,
                "domain": doc.domain,
                "source_type": doc.source_type,
                "updated_at": doc.updated_at.isoformat(),
                "visit_count": len(doc.visits),
            })

            # Aggregate entities
            for entity in doc.entities:
                key = f"{entity.type}:{entity.name}".lower()
                if key not in entity_map:
                    entity_map[key] = {
                        "id": f"ent_{len(entity_map)}",
                        "name": entity.name,
                        "type": entity.type,
                        "document_ids": [],
                    }
                if doc_id not in entity_map[key]["document_ids"]:
                    entity_map[key]["document_ids"].append(doc_id)

            # Aggregate keywords
            for kw in doc.keywords:
                kw_lower = kw.keyword.lower().strip()
                if kw_lower not in keyword_map:
                    keyword_map[kw_lower] = {
                        "id": f"kw_{kw_lower}",
                        "name": kw.keyword,
                        "document_ids": [],
                    }
                if doc_id not in keyword_map[kw_lower]["document_ids"]:
                    keyword_map[kw_lower]["document_ids"].append(doc_id)

        # Filter keywords by frequency
        active_keywords = [
            kw for kw in keyword_map.values()
            if len(kw["document_ids"]) >= min_keyword_freq
        ]

        # Build entity nodes
        entity_nodes = [
            {
                "id": ent["id"],
                "label": ent["name"],
                "type": "entity",
                "entity_type": ent["type"],
                "document_count": len(ent["document_ids"]),
            }
            for ent in entity_map.values()
        ]

        # Build keyword nodes
        keyword_nodes = [
            {
                "id": kw["id"],
                "label": kw["name"],
                "type": "keyword",
                "document_count": len(kw["document_ids"]),
            }
            for kw in active_keywords
        ]

        # Build edges: document -> keyword
        for kw in active_keywords:
            for doc_id in kw["document_ids"]:
                edges.append({
                    "source": doc_id,
                    "target": kw["id"],
                    "type": "has_keyword",
                })

        # Build edges: document -> entity
        for ent in entity_map.values():
            for doc_id in ent["document_ids"]:
                edges.append({
                    "source": doc_id,
                    "target": ent["id"],
                    "type": "has_entity",
                })

        # Build edges: entity co-occurrence (entities appearing in same document)
        ent_list = list(entity_map.values())
        for i in range(len(ent_list)):
            for j in range(i + 1, len(ent_list)):
                shared_docs = set(ent_list[i]["document_ids"]) & set(ent_list[j]["document_ids"])
                if shared_docs:
                    edges.append({
                        "source": ent_list[i]["id"],
                        "target": ent_list[j]["id"],
                        "type": "co_occurs",
                        "weight": len(shared_docs),
                    })

        # Build edges: keyword co-occurrence (keywords appearing in same document)
        kw_list = active_keywords
        for i in range(len(kw_list)):
            for j in range(i + 1, len(kw_list)):
                shared_docs = set(kw_list[i]["document_ids"]) & set(kw_list[j]["document_ids"])
                if len(shared_docs) >= min_keyword_freq:
                    edges.append({
                        "source": kw_list[i]["id"],
                        "target": kw_list[j]["id"],
                        "type": "co_occurs",
                        "weight": len(shared_docs),
                    })

        return {
            "nodes": {
                "documents": doc_nodes,
                "entities": entity_nodes,
                "keywords": keyword_nodes,
            },
            "edges": edges,
            "stats": {
                "document_count": len(doc_nodes),
                "entity_count": len(entity_nodes),
                "keyword_count": len(keyword_nodes),
                "edge_count": len(edges),
            },
        }

    except Exception as e:
        logger.error(f"Failed To Generate Graph Data: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed To Generate Graph Data.",
        ) from e
