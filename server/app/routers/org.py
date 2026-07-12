from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection
from psycopg.errors import UniqueViolation, CheckViolation, ForeignKeyViolation
from server.app.core.database import get_db
from server.app.core.dependencies import require_roles, get_current_user
from server.app.schemas import (
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    UserResponse, UserRoleUpdate, UserStatusUpdate
)

router = APIRouter(tags=["Organization Setup"])

# =============================================================================
# Departments Endpoints
# =============================================================================

@router.get("/departments", response_model=List[DepartmentResponse])
def get_departments(db: Connection = Depends(get_db)):
    """Retrieve list of all departments."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT 
                d.id, 
                d.name, 
                d.parent_id, 
                d.head_user_id, 
                d.is_active,
                u.name AS head_name,
                p.name AS parent_name
            FROM departments d
            LEFT JOIN users u ON d.head_user_id = u.id
            LEFT JOIN departments p ON d.parent_id = p.id
            ORDER BY d.name ASC
            """
        )
        return cur.fetchall()

@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    dept_in: DepartmentCreate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Create a new department (Admin only)."""
    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO departments (name, parent_id, head_user_id)
                VALUES (%s, %s, %s)
                RETURNING id, name, parent_id, head_user_id, is_active
                """,
                (dept_in.name, dept_in.parent_id, dept_in.head_user_id)
            )
            new_dept = cur.fetchone()
            db.commit()
            
            # Fetch names for response
            cur.execute(
                """
                SELECT 
                    d.id, d.name, d.parent_id, d.head_user_id, d.is_active,
                    u.name AS head_name,
                    p.name AS parent_name
                FROM departments d
                LEFT JOIN users u ON d.head_user_id = u.id
                LEFT JOIN departments p ON d.parent_id = p.id
                WHERE d.id = %s
                """,
                (new_dept["id"],)
            )
            return cur.fetchone()
    except UniqueViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A department named '{dept_in.name}' already exists."
        )
    except ForeignKeyViolation as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent department or head user ID."
        )
    except CheckViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A department cannot be its own parent."
        )

@router.patch("/departments/{id}", response_model=DepartmentResponse)
def update_department(
    id: int,
    dept_in: DepartmentUpdate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Update department details (Admin only)."""
    # Build dynamic update query
    updates = []
    params = []
    
    if dept_in.name is not None:
        updates.append("name = %s")
        params.append(dept_in.name)
    if dept_in.parent_id is not None:
        updates.append("parent_id = %s")
        params.append(dept_in.parent_id)
    if dept_in.head_user_id is not None:
        updates.append("head_user_id = %s")
        params.append(dept_in.head_user_id)
    if dept_in.is_active is not None:
        updates.append("is_active = %s")
        params.append(dept_in.is_active)
        
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No update fields provided."
        )
        
    params.append(id)
    
    try:
        with db.cursor() as cur:
            cur.execute(f"SELECT id FROM departments WHERE id = %s", (id,))
            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Department with ID {id} not found."
                )
                
            cur.execute(
                f"UPDATE departments SET {', '.join(updates)} WHERE id = %s",
                tuple(params)
            )
            db.commit()
            
            # Fetch updated values
            cur.execute(
                """
                SELECT 
                    d.id, d.name, d.parent_id, d.head_user_id, d.is_active,
                    u.name AS head_name,
                    p.name AS parent_name
                FROM departments d
                LEFT JOIN users u ON d.head_user_id = u.id
                LEFT JOIN departments p ON d.parent_id = p.id
                WHERE d.id = %s
                """,
                (id,)
            )
            return cur.fetchone()
    except UniqueViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A department with this name already exists."
        )
    except ForeignKeyViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent department or head user ID."
        )
    except CheckViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A department cannot be its own parent."
        )

# =============================================================================
# Categories Endpoints
# =============================================================================

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(db: Connection = Depends(get_db)):
    """Retrieve list of all categories."""
    with db.cursor() as cur:
        cur.execute("SELECT id, name, warranty_months FROM categories ORDER BY name ASC")
        return cur.fetchall()

@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    cat_in: CategoryCreate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Create a new category (Admin only)."""
    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO categories (name, warranty_months)
                VALUES (%s, %s)
                RETURNING id, name, warranty_months
                """,
                (cat_in.name, cat_in.warranty_months)
            )
            category = cur.fetchone()
            db.commit()
            return category
    except UniqueViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A category named '{cat_in.name}' already exists."
        )

@router.patch("/categories/{id}", response_model=CategoryResponse)
def update_category(
    id: int,
    cat_in: CategoryUpdate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Update a category (Admin only)."""
    updates = []
    params = []
    
    if cat_in.name is not None:
        updates.append("name = %s")
        params.append(cat_in.name)
    if cat_in.warranty_months is not None:
        updates.append("warranty_months = %s")
        params.append(cat_in.warranty_months)
        
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No update fields provided."
        )
        
    params.append(id)
    
    try:
        with db.cursor() as cur:
            cur.execute("SELECT id FROM categories WHERE id = %s", (id,))
            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Category with ID {id} not found."
                )
                
            cur.execute(
                f"UPDATE categories SET {', '.join(updates)} WHERE id = %s RETURNING id, name, warranty_months",
                tuple(params)
            )
            category = cur.fetchone()
            db.commit()
            return category
    except UniqueViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name already exists."
        )

# =============================================================================
# Employee / User Directory Endpoints
# =============================================================================

@router.get("/users", response_model=List[UserResponse])
def get_users(
    department_id: Optional[int] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """Retrieve user directory. Available to any logged-in user."""
    query = "SELECT id, name, email, role, department_id, is_active FROM users"
    conditions = []
    params = []
    
    if department_id is not None:
        conditions.append("department_id = %s")
        params.append(department_id)
    if role is not None:
        conditions.append("role = %s")
        params.append(role)
    if is_active is not None:
        conditions.append("is_active = %s")
        params.append(is_active)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY name ASC"
    
    with db.cursor() as cur:
        cur.execute(query, tuple(params))
        return cur.fetchall()

@router.patch("/users/{id}/role", response_model=UserResponse)
def update_user_role(
    id: int,
    role_in: UserRoleUpdate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Promote or change user role (Admin only)."""
    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s", (id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID {id} not found."
            )
            
        cur.execute(
            """
            UPDATE users
            SET role = %s
            WHERE id = %s
            RETURNING id, name, email, role, department_id, is_active
            """,
            (role_in.role.value, id)
        )
        user = cur.fetchone()
        db.commit()
        return user

@router.patch("/users/{id}/status", response_model=UserResponse)
def update_user_status(
    id: int,
    status_in: UserStatusUpdate,
    current_user: dict = Depends(require_roles("admin")),
    db: Connection = Depends(get_db)
):
    """Activate or deactivate user (Admin only)."""
    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s", (id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID {id} not found."
            )
            
        cur.execute(
            """
            UPDATE users
            SET is_active = %s
            WHERE id = %s
            RETURNING id, name, email, role, department_id, is_active
            """,
            (status_in.is_active, id)
        )
        user = cur.fetchone()
        db.commit()
        return user
