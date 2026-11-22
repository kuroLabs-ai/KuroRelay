"""add_test_suites_and_cases

Revision ID: 5b9d70c06a42
Revises: ebbc8c30ef1e
Create Date: 2026-11-15 17:32:19.108198
"""
from __future__ import annotations

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op


revision: str = '5b9d70c06a42'
down_revision: str | None = 'ebbc8c30ef1e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'test_suites',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('workspace_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_test_suites_workspace_id'), 'test_suites', ['workspace_id'], unique=False)

    op.create_table(
        'test_cases',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('suite_id', sa.String(), nullable=False),
        sa.Column('request_id', sa.String(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('assertion_type', sa.String(length=64), nullable=False),
        sa.Column('assertion_config_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['request_id'], ['requests.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['suite_id'], ['test_suites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_test_cases_request_id'), 'test_cases', ['request_id'], unique=False)
    op.create_index(op.f('ix_test_cases_suite_id'), 'test_cases', ['suite_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_test_cases_suite_id'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_request_id'), table_name='test_cases')
    op.drop_table('test_cases')
    op.drop_index(op.f('ix_test_suites_workspace_id'), table_name='test_suites')
    op.drop_table('test_suites')
