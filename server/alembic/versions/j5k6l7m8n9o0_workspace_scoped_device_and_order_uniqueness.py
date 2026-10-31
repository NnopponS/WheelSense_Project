"""Make device/smart-device/room mapping and pharmacy order identity workspace-scoped.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j5k6l7m8n9o0"
down_revision: Union[str, None] = "i4j5k6l7m8n9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _unique_constraint_name(table: str, columns: list[str]) -> str | None:
    inspector = sa.inspect(op.get_bind())
    target = list(columns)
    for constraint in inspector.get_unique_constraints(table):
        if (constraint.get("column_names") or []) == target:
            return constraint.get("name")
    return None


def _drop_unique_constraints_for_columns(table: str, columns: list[str]) -> None:
    inspector = sa.inspect(op.get_bind())
    target = list(columns)
    for constraint in inspector.get_unique_constraints(table):
        if (constraint.get("column_names") or []) != target:
            continue
        name = constraint.get("name")
        if name:
            op.drop_constraint(name, table, type_="unique")


def _drop_unique_indexes_for_columns(table: str, columns: list[str]) -> None:
    inspector = sa.inspect(op.get_bind())
    target = list(columns)
    for index in inspector.get_indexes(table):
        if not index.get("unique"):
            continue
        if (index.get("column_names") or []) != target:
            continue
        name = index.get("name")
        if name:
            op.drop_index(name, table_name=table)


def _index_exists(table: str, name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index.get("name") == name for index in inspector.get_indexes(table))


def _unique_index_name(table: str, columns: list[str]) -> str | None:
    inspector = sa.inspect(op.get_bind())
    target = list(columns)
    for index in inspector.get_indexes(table):
        if not index.get("unique"):
            continue
        if (index.get("column_names") or []) == target:
            return index.get("name")
    return None


def upgrade() -> None:
    # Keep one canonical device row per (workspace_id, device_id) before enforcing uniqueness.
    op.execute(
        """
        DELETE FROM devices d
        USING (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY workspace_id, device_id
                       ORDER BY id
                   ) AS rn
            FROM devices
        ) dup
        WHERE d.id = dup.id AND dup.rn > 1
        """
    )
    if not _unique_constraint_name("devices", ["workspace_id", "device_id"]):
        op.create_unique_constraint(
            "uq_devices_workspace_device_id",
            "devices",
            ["workspace_id", "device_id"],
        )

    # Replace global room.node_device_id uniqueness with workspace-scoped uniqueness.
    _drop_unique_constraints_for_columns("rooms", ["node_device_id"])
    _drop_unique_indexes_for_columns("rooms", ["node_device_id"])
    if not _unique_constraint_name("rooms", ["workspace_id", "node_device_id"]):
        op.create_unique_constraint(
            "uq_rooms_workspace_node_device_id",
            "rooms",
            ["workspace_id", "node_device_id"],
        )

    # Move smart-device entity uniqueness from global to workspace-scoped.
    _drop_unique_constraints_for_columns("smart_devices", ["ha_entity_id"])
    _drop_unique_indexes_for_columns("smart_devices", ["ha_entity_id"])
    if not _index_exists("smart_devices", "ix_smart_devices_ha_entity_id"):
        op.create_index(
            "ix_smart_devices_ha_entity_id",
            "smart_devices",
            ["ha_entity_id"],
            unique=False,
        )
    if not _unique_constraint_name("smart_devices", ["workspace_id", "ha_entity_id"]):
        op.create_unique_constraint(
            "uq_smart_devices_workspace_ha_entity_id",
            "smart_devices",
            ["workspace_id", "ha_entity_id"],
        )

    # Keep one canonical order row per (workspace_id, order_number) before enforcing uniqueness.
    op.execute(
        """
        DELETE FROM pharmacy_orders p
        USING (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY workspace_id, order_number
                       ORDER BY id
                   ) AS rn
            FROM pharmacy_orders
            WHERE order_number IS NOT NULL
        ) dup
        WHERE p.id = dup.id AND dup.rn > 1
        """
    )
    if not _unique_constraint_name("pharmacy_orders", ["workspace_id", "order_number"]):
        op.create_unique_constraint(
            "uq_pharmacy_orders_workspace_order_number",
            "pharmacy_orders",
            ["workspace_id", "order_number"],
        )


def downgrade() -> None:
    pharmacy_uq = _unique_constraint_name("pharmacy_orders", ["workspace_id", "order_number"])
    if pharmacy_uq:
        op.drop_constraint(
            pharmacy_uq,
            "pharmacy_orders",
            type_="unique",
        )

    smart_uq = _unique_constraint_name("smart_devices", ["workspace_id", "ha_entity_id"])
    if smart_uq:
        op.drop_constraint(
            smart_uq,
            "smart_devices",
            type_="unique",
        )
    if _index_exists("smart_devices", "ix_smart_devices_ha_entity_id"):
        op.drop_index("ix_smart_devices_ha_entity_id", table_name="smart_devices")
    if not _unique_index_name("smart_devices", ["ha_entity_id"]):
        op.create_index(
            "ix_smart_devices_ha_entity_id",
            "smart_devices",
            ["ha_entity_id"],
            unique=True,
        )

    rooms_uq = _unique_constraint_name("rooms", ["workspace_id", "node_device_id"])
    if rooms_uq:
        op.drop_constraint(
            rooms_uq,
            "rooms",
            type_="unique",
        )
    if not _unique_constraint_name("rooms", ["node_device_id"]):
        op.create_unique_constraint(
            "uq_rooms_node_device_id",
            "rooms",
            ["node_device_id"],
        )

    devices_uq = _unique_constraint_name("devices", ["workspace_id", "device_id"])
    if devices_uq:
        op.drop_constraint(
            devices_uq,
            "devices",
            type_="unique",
        )
