"""
TraceBridge AI - FastAPI Application
Main application entry point for Milestone 2.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import settings
from app.routers import documents, query

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="TraceBridge AI",
    description=(
        "A RAG-based backend for FDA 510(k) documentation gap detection. "
        "Upload PDF/DOCX documents, index them for semantic search, "
        "query for regulatory insights with citations, and generate gap reports."
    ),
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware - Allow all origins for deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(documents.router)
app.include_router(query.router)


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logger.info("Starting TraceBridge AI v0.2.0...")
    
    # Ensure directories exist
    settings.ensure_directories()
    
    # Log configuration
    if settings.use_openai_embeddings:
        logger.info(f"Using OpenAI embeddings: {settings.embedding_model}")
        logger.info(f"Using LLM: {settings.llm_model}")
    else:
        logger.info("Using local embeddings (sentence-transformers)")
        logger.info("LLM features limited (requires OpenAI API key)")
    
    logger.info(f"Vector store: {settings.chroma_persist_dir}")
    logger.info(f"Upload directory: {settings.upload_dir}")
    logger.info(f"Chunk size: {settings.chunk_size}, overlap: {settings.chunk_overlap}")
    
    logger.info("TraceBridge AI started successfully!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down TraceBridge AI...")


@app.get("/", tags=["health"])
async def root():
    """Root endpoint - API information."""
    return {
        "name": "TraceBridge AI",
        "version": "0.2.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "upload": "POST /upload",
            "documents": "GET /documents",
            "delete": "DELETE /documents/{doc_id}",
            "query": "POST /query",
            "gap_report": "POST /gap-report"
        }
    }


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "embedding_mode": "openai" if settings.use_openai_embeddings else "local",
        "llm_available": settings.use_openai_embeddings
    }
