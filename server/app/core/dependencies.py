from typing import List
from fastapi import Request, HTTPException, status, Depends
from psycopg import Connection
from server.app.core.database import get_db
from server.app.core.security import decode_access_token

async def get_current_user(request: Request, db: Connection = Depends(get_db)) -> dict:
    """FastAPI dependency to retrieve the currently authenticated user from the cookie."""
    token = request.cookies.get("access_token")
    if not token:
        # Fallback to Authorization header if present (for easier testing via Swagger UI/docs)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    
    try:
        user_id = int(payload["sub"])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identification",
        )
        
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, role, department_id, is_active FROM users WHERE id = %s",
            (user_id,)
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )
        if not user["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is inactive",
            )
        return user

def require_roles(*allowed_roles: str):
    """Factory dependency to enforce that a user has one of the specified roles."""
    async def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: insufficient role privileges",
            )
        return current_user
    return dependency
