"""
WheelSense v2.0 - Nodes Routes
BLE beacon node management
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from ..core.database import db

router = APIRouter()


class NodeCreate(BaseModel):
    name: str
    room_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    room_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    status: Optional[str] = None


@router.get("")
async def get_nodes():
    """Get all nodes"""
    nodes = await db.fetch_all("""
        SELECT n.*, r.name as room_name
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        ORDER BY n.id
    """)
    return {"nodes": nodes}


@router.get("/{node_id}")
async def get_node(node_id: str):
    """Get a specific node"""
    node = await db.fetch_one("""
        SELECT n.*, r.name as room_name
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        WHERE n.id = $1
    """, (node_id,))
    
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.post("")
async def create_node(node: NodeCreate):
    """Create a new node"""
    node_id = f"NODE-{str(uuid.uuid4())[:4].upper()}"
    
    await db.execute(
        """INSERT INTO nodes (id, name, room_id, x, y, status)
           VALUES ($1, $2, $3, $4, $5, 'offline')""",
        (node_id, node.name, node.room_id, node.x, node.y)
    )
    
    # Update room's node_id if room is specified
    if node.room_id:
        await db.execute(
            "UPDATE rooms SET node_id = $1 WHERE id = $2",
            (node_id, node.room_id)
        )
    
    return {"id": node_id, "message": "Node created successfully"}


@router.put("/{node_id}")
async def update_node(node_id: str, node: NodeUpdate):
    """Update a node"""
    existing = await db.fetch_one("SELECT * FROM nodes WHERE id = $1", (node_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Node not found")
    
    updates = {k: v for k, v in node.model_dump().items() if v is not None}
    if updates:
        set_parts = []
        values = []
        for i, (k, v) in enumerate(updates.items(), 1):
            set_parts.append(f"{k} = ${i}")
            values.append(v)
        values.append(node_id)
        set_clause = ", ".join(set_parts)
        n = len(updates) + 1
        await db.execute(
            f"UPDATE nodes SET {set_clause}, updated_at = NOW() WHERE id = ${n}",
            tuple(values)
        )
    
    # Update room's node_id if room changed
    if node.room_id:
        await db.execute(
            "UPDATE rooms SET node_id = NULL WHERE node_id = $1",
            (node_id,)
        )
        await db.execute(
            "UPDATE rooms SET node_id = $1 WHERE id = $2",
            (node_id, node.room_id)
        )
    
    return {"message": "Node updated successfully"}


@router.delete("/{node_id}")
async def delete_node(node_id: str):
    """Delete a node"""
    await db.execute(
        "UPDATE rooms SET node_id = NULL WHERE node_id = $1",
        (node_id,)
    )
    await db.execute("DELETE FROM nodes WHERE id = $1", (node_id,))
    return {"message": "Node deleted successfully"}


@router.get("/{node_id}/history")
async def get_node_history(node_id: str, limit: int = 100):
    """Get detection history for a node"""
    history = await db.fetch_all("""
        SELECT wh.*, w.name as wheelchair_name
        FROM wheelchair_history wh
        LEFT JOIN wheelchairs w ON wh.wheelchair_id = w.id
        WHERE wh.node_id = $1
        ORDER BY wh.timestamp DESC
        LIMIT $2
    """, (node_id, limit))
    return {"history": history}
