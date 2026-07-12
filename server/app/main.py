import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from server.app.core.database import init_db_pool, close_db_pool
from server.app.routers.auth import router as auth_router
from server.app.routers.org import router as org_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events to manage database connection pool."""
    logger.info("Starting up AssetFlow application...")
    init_db_pool()
    yield
    logger.info("Shutting down AssetFlow application...")
    close_db_pool()

app = FastAPI(
    title="AssetFlow API",
    description="Enterprise Asset & Resource Management System Backend Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
# React + Vite runs on http://localhost:5173 by default. 
# Allow credentials must be True for httpOnly cookies.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(org_router, prefix="/api")

@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "healthy", "service": "AssetFlow API"}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global fallback exception handler to ensure JSON response structure."""
    logger.error(f"Global error handler caught: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred on the server."}
    )
