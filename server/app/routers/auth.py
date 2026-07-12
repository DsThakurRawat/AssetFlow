from fastapi import APIRouter, Depends, HTTPException, status, Response
from psycopg import Connection
from server.app.core.database import get_db
from server.app.core.security import get_password_hash, verify_password, create_access_token
from server.app.core.dependencies import get_current_user
from server.app.schemas import UserSignup, UserLogin, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserSignup, response: Response, db: Connection = Depends(get_db)):
    """Sign up a new user. The role is hardcoded to 'employee'."""
    email_lower = user_in.email.lower()
    
    with db.cursor() as cur:
        # Check if user already exists
        cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email_lower,))
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email address already exists."
            )
        
        # Hash password and save user
        pwd_hash = get_password_hash(user_in.password)
        cur.execute(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, 'employee')
            RETURNING id, name, email, role, department_id, is_active
            """,
            (user_in.name, user_in.email, pwd_hash)
        )
        user = cur.fetchone()
        db.commit()
    
    # Generate JWT token
    token = create_access_token(data={"sub": str(user["id"])})
    
    # Set httponly cookie
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=1440 * 60,
        samesite="lax",
        secure=False
    )
    
    return user

@router.post("/login", response_model=UserResponse)
def login(login_in: UserLogin, response: Response, db: Connection = Depends(get_db)):
    """Log in an existing user."""
    email_lower = login_in.email.lower()
    
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, password_hash, role, department_id, is_active FROM users WHERE lower(email) = %s",
            (email_lower,)
        )
        user = cur.fetchone()
        
    if not user or not verify_password(login_in.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
        
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )
        
    token = create_access_token(data={"sub": str(user["id"])})
    
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=1440 * 60,
        samesite="lax",
        secure=False
    )
    
    return user

@router.post("/logout")
def logout(response: Response):
    """Log out the current user by clearing the JWT cookie."""
    response.delete_cookie(key="access_token")
    return {"detail": "Successfully logged out."}

@router.get("/me", response_model=UserResponse)
def me(current_user: dict = Depends(get_current_user)):
    """Get the currently logged in user's profile."""
    return current_user
