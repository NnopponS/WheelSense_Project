from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

ModelType = TypeVar("ModelType")
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        """
        CRUD object with default methods to Create, Read, Update, Delete (CRUD).
        Every query strictly enforces workspace_id isolation.
        """
        self.model = model

    async def get(self, session: AsyncSession, ws_id: int, id: int) -> Optional[ModelType]:
        result = await session.execute(
            select(self.model).filter(
                self.model.id == id,
                self.model.workspace_id == ws_id
            )
        )
        return result.scalars().first()

    async def get_multi(
        self, session: AsyncSession, ws_id: int, skip: int = 0, limit: int = 100
    ) -> List[ModelType]:
        result = await session.execute(
            select(self.model)
            .filter(self.model.workspace_id == ws_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, session: AsyncSession, ws_id: int, obj_in: CreateSchemaType) -> ModelType:
        obj_in_data = jsonable_encoder(obj_in)
        db_obj = self.model(**obj_in_data)
        db_obj.workspace_id = ws_id  # Enforce workspace assignment
        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def update(
        self,
        session: AsyncSession,
        ws_id: int,
        db_obj: ModelType,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]]
    ) -> ModelType:
        # Enforce that db_obj belongs to ws_id before updating
        if getattr(db_obj, "workspace_id", None) != ws_id:
            raise ValueError("Cross-workspace update is forbidden")

        obj_data = jsonable_encoder(db_obj)
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
            
        for field in obj_data:
            if field in update_data:
                setattr(db_obj, field, update_data[field])
                
        # Ensure workspace didn't get overwritten
        db_obj.workspace_id = ws_id
        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def delete(self, session: AsyncSession, ws_id: int, id: int) -> Optional[ModelType]:
        obj = await self.get(session, ws_id, id)
        if obj:
            await session.delete(obj)
            await session.commit()
        return obj
