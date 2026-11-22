"""add_workflows_and_workflow_steps

Revision ID: 7c8d9e0f1a2b
Revises: 5b9d70c06a42
Create Date: 2026-11-15 20:25:00.000000
"""
from __future__ import annotations

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op


revision: str = '7c8d9e0f1a2b'
down_revision: str | None = '5b9d70c06a42'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if 'workflows' not in existing_tables:
        op.create_table(
            'workflows',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('workspace_id', sa.String(), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_workflows_workspace_id'), 'workflows', ['workspace_id'], unique=False)

    if 'workflow_steps' not in existing_tables:
        op.create_table(
            'workflow_steps',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('workflow_id', sa.String(), nullable=False),
            sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('method', sa.String(length=16), nullable=False, server_default='GET'),
            sa.Column('url', sa.Text(), nullable=False, server_default=''),
            sa.Column('configuration_json', sa.Text(), nullable=False, server_default='{}'),
            sa.Column('extract_vars_json', sa.Text(), nullable=False, server_default='[]'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_workflow_steps_workflow_id'), 'workflow_steps', ['workflow_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_workflow_steps_workflow_id'), table_name='workflow_steps')
    op.drop_table('workflow_steps')
    op.drop_index(op.f('ix_workflows_workspace_id'), table_name='workflows')
    op.drop_table('workflows')
