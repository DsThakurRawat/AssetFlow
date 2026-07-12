from enum import Enum
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserRole(str, Enum):
    ADMIN = "admin"
    ASSET_MANAGER = "asset_manager"
    DEPT_HEAD = "dept_head"
    EMPLOYEE = "employee"

class UserSignup(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    department_id: Optional[int] = None
    is_active: bool

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: UserRole

class UserStatusUpdate(BaseModel):
    is_active: bool

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: Optional[int] = None
    head_user_id: Optional[int] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    parent_id: Optional[int] = None
    head_user_id: Optional[int] = None
    is_active: Optional[bool] = None

class DepartmentResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    head_user_id: Optional[int] = None
    is_active: bool
    head_name: Optional[str] = None
    parent_name: Optional[str] = None

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    warranty_months: Optional[int] = Field(None, ge=0)

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    warranty_months: Optional[int] = Field(None, ge=0)

class CategoryResponse(BaseModel):
    id: int
    name: str
    warranty_months: Optional[int] = None

    class Config:
        from_attributes = True
