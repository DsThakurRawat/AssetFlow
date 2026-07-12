from enum import Enum
from typing import Optional
from datetime import date, datetime
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
    department_name: Optional[str] = None
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


# =============================================================================
# Asset Engine Schemas
# =============================================================================

class AssetCondition(str, Enum):
    NEW = "new"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    DAMAGED = "damaged"


class AssetStatus(str, Enum):
    AVAILABLE = "available"
    ALLOCATED = "allocated"
    UNDER_MAINTENANCE = "under_maintenance"
    RETIRED = "retired"
    LOST = "lost"
    DISPOSED = "disposed"


class TransferStatus(str, Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class BookingStatus(str, Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class MaintStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    TECHNICIAN_ASSIGNED = "technician_assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"


class MaintPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    serial_number: Optional[str] = Field(None, min_length=1, max_length=100)
    category_id: Optional[int] = None
    cost: Optional[float] = Field(None, ge=0.0)
    acquisition_date: Optional[date] = None
    condition: AssetCondition = AssetCondition.GOOD
    location: Optional[str] = None
    photo_url: Optional[str] = None
    is_bookable: bool = False


class AssetResponse(BaseModel):
    id: int
    tag: str
    name: str
    serial_number: Optional[str] = None
    category_id: Optional[int] = None
    cost: Optional[float] = None
    acquisition_date: Optional[date] = None
    condition: AssetCondition
    location: Optional[str] = None
    photo_url: Optional[str] = None
    is_bookable: bool
    status: AssetStatus
    created_at: datetime
    category_name: Optional[str] = None
    current_holder_name: Optional[str] = None
    current_holder_type: Optional[str] = None  # "employee", "department", or None

    class Config:
        from_attributes = True


class AllocationCreate(BaseModel):
    asset_id: int
    employee_id: Optional[int] = None
    department_id: Optional[int] = None
    expected_return_date: Optional[date] = None
    notes: Optional[str] = None


class AllocationResponse(BaseModel):
    id: int
    asset_id: int
    employee_id: Optional[int] = None
    department_id: Optional[int] = None
    allocated_by: Optional[int] = None
    allocated_at: datetime
    expected_return_date: Optional[date] = None
    returned_at: Optional[datetime] = None
    return_condition: Optional[AssetCondition] = None
    notes: Optional[str] = None
    asset_name: Optional[str] = None
    asset_tag: Optional[str] = None
    employee_name: Optional[str] = None
    department_name: Optional[str] = None

    class Config:
        from_attributes = True


class AllocationReturn(BaseModel):
    return_condition: AssetCondition
    notes: Optional[str] = None


class TransferCreate(BaseModel):
    asset_id: int
    to_employee_id: Optional[int] = None
    to_department_id: Optional[int] = None
    reason: Optional[str] = None


class TransferResponse(BaseModel):
    id: int
    asset_id: int
    to_employee_id: Optional[int] = None
    to_department_id: Optional[int] = None
    requested_by: Optional[int] = None
    status: TransferStatus
    reason: Optional[str] = None
    requested_at: datetime
    decided_by: Optional[int] = None
    decided_at: Optional[datetime] = None
    asset_name: Optional[str] = None
    asset_tag: Optional[str] = None
    to_employee_name: Optional[str] = None
    to_department_name: Optional[str] = None
    requested_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class TransferDecision(BaseModel):
    status: str  # approved or rejected
    reason: Optional[str] = None


class BookingCreate(BaseModel):
    asset_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None


class BookingResponse(BaseModel):
    id: int
    asset_id: int
    booked_by: Optional[int] = None
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None
    status: BookingStatus
    created_at: datetime
    asset_name: Optional[str] = None
    asset_tag: Optional[str] = None
    booked_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class MaintenanceCreate(BaseModel):
    asset_id: int
    issue: str = Field(..., min_length=1)
    priority: MaintPriority = MaintPriority.MEDIUM
    photo_url: Optional[str] = None


class MaintenanceResponse(BaseModel):
    id: int
    asset_id: int
    raised_by: Optional[int] = None
    issue: str
    priority: MaintPriority
    status: MaintStatus
    photo_url: Optional[str] = None
    technician_name: Optional[str] = None
    decided_by: Optional[int] = None
    resolution: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    asset_name: Optional[str] = None
    asset_tag: Optional[str] = None
    raised_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class MaintenanceUpdate(BaseModel):
    status: MaintStatus
    technician_name: Optional[str] = None
    resolution: Optional[str] = None
