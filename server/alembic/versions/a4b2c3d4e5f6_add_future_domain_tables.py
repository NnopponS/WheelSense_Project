"""Add future domain tables for floorplans, specialists, prescriptions, pharmacy.

Revision ID: a4b2c3d4e5f6
Revises: 9a6b3f4d2c10
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b2c3d4e5f6"
down_revision: Union[str, None] = "9a6b3f4d2c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "floorplan_assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=True),
        sa.Column("floor_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_floorplan_assets_workspace_id"), "floorplan_assets", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_floorplan_assets_facility_id"), "floorplan_assets", ["facility_id"], unique=False)
    op.create_index(op.f("ix_floorplan_assets_floor_id"), "floorplan_assets", ["floor_id"], unique=False)

    op.create_table(
        "specialists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=64), nullable=False),
        sa.Column("last_name", sa.String(length=64), nullable=False),
        sa.Column("specialty", sa.String(length=64), nullable=False),
        sa.Column("license_number", sa.String(length=64), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_specialists_workspace_id"), "specialists", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_specialists_specialty"), "specialists", ["specialty"], unique=False)
    op.create_index(op.f("ix_specialists_license_number"), "specialists", ["license_number"], unique=False)
    op.create_index(op.f("ix_specialists_is_active"), "specialists", ["is_active"], unique=False)

    op.create_table(
        "prescriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("specialist_id", sa.Integer(), nullable=True),
        sa.Column("prescribed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("medication_name", sa.String(length=128), nullable=False),
        sa.Column("dosage", sa.String(length=64), nullable=False),
        sa.Column("frequency", sa.String(length=64), nullable=False),
        sa.Column("route", sa.String(length=32), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["prescribed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["specialist_id"], ["specialists.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_prescriptions_workspace_id"), "prescriptions", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_prescriptions_patient_id"), "prescriptions", ["patient_id"], unique=False)
    op.create_index(op.f("ix_prescriptions_specialist_id"), "prescriptions", ["specialist_id"], unique=False)
    op.create_index(op.f("ix_prescriptions_status"), "prescriptions", ["status"], unique=False)

    op.create_table(
        "pharmacy_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=True),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("pharmacy_name", sa.String(length=128), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("refills_remaining", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pharmacy_orders_workspace_id"), "pharmacy_orders", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_pharmacy_orders_prescription_id"), "pharmacy_orders", ["prescription_id"], unique=False)
    op.create_index(op.f("ix_pharmacy_orders_patient_id"), "pharmacy_orders", ["patient_id"], unique=False)
    op.create_index(op.f("ix_pharmacy_orders_order_number"), "pharmacy_orders", ["order_number"], unique=False)
    op.create_index(op.f("ix_pharmacy_orders_status"), "pharmacy_orders", ["status"], unique=False)
    op.create_index(op.f("ix_pharmacy_orders_requested_at"), "pharmacy_orders", ["requested_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_pharmacy_orders_requested_at"), table_name="pharmacy_orders")
    op.drop_index(op.f("ix_pharmacy_orders_status"), table_name="pharmacy_orders")
    op.drop_index(op.f("ix_pharmacy_orders_order_number"), table_name="pharmacy_orders")
    op.drop_index(op.f("ix_pharmacy_orders_patient_id"), table_name="pharmacy_orders")
    op.drop_index(op.f("ix_pharmacy_orders_prescription_id"), table_name="pharmacy_orders")
    op.drop_index(op.f("ix_pharmacy_orders_workspace_id"), table_name="pharmacy_orders")
    op.drop_table("pharmacy_orders")

    op.drop_index(op.f("ix_prescriptions_status"), table_name="prescriptions")
    op.drop_index(op.f("ix_prescriptions_specialist_id"), table_name="prescriptions")
    op.drop_index(op.f("ix_prescriptions_patient_id"), table_name="prescriptions")
    op.drop_index(op.f("ix_prescriptions_workspace_id"), table_name="prescriptions")
    op.drop_table("prescriptions")

    op.drop_index(op.f("ix_specialists_is_active"), table_name="specialists")
    op.drop_index(op.f("ix_specialists_license_number"), table_name="specialists")
    op.drop_index(op.f("ix_specialists_specialty"), table_name="specialists")
    op.drop_index(op.f("ix_specialists_workspace_id"), table_name="specialists")
    op.drop_table("specialists")

    op.drop_index(op.f("ix_floorplan_assets_floor_id"), table_name="floorplan_assets")
    op.drop_index(op.f("ix_floorplan_assets_facility_id"), table_name="floorplan_assets")
    op.drop_index(op.f("ix_floorplan_assets_workspace_id"), table_name="floorplan_assets")
    op.drop_table("floorplan_assets")
