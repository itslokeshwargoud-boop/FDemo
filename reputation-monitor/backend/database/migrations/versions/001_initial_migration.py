"""Initial migration: create all tables with indexes.

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === keywords table ===
    op.create_table(
        'keywords',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('keyword', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('owner_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('keyword'),
    )

    # === posts table ===
    op.create_table(
        'posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('keyword_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('platform', sa.String(50), nullable=False),
        sa.Column('post_id', sa.String(255), nullable=False),
        sa.Column('author_id', sa.String(255), nullable=False),
        sa.Column('author_name', sa.String(255), nullable=False),
        sa.Column('followers_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('posted_at', sa.DateTime(), nullable=False),
        sa.Column('collected_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('likes_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('replies_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('shares_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('language', sa.String(10), nullable=False, server_default="'en'"),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform', 'post_id', name='uq_posts_platform_post_id'),
    )
    op.create_index('idx_posts_keyword_platform', 'posts', ['keyword_id', 'platform'])
    op.create_index('idx_posts_posted_at', 'posts', [sa.text('posted_at DESC')])
    op.create_index('idx_posts_platform_id', 'posts', ['platform', 'post_id'])

    # === sentiment_results table ===
    op.create_table(
        'sentiment_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('post_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sentiment', sa.String(20), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('model_version', sa.String(100), nullable=False,
                  server_default="'cardiffnlp/twitter-roberta-base-sentiment-latest'"),
        sa.Column('analyzed_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_sentiment_post_id', 'sentiment_results', ['post_id'])

    # === tracked_authors table ===
    op.create_table(
        'tracked_authors',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('platform', sa.String(50), nullable=False),
        sa.Column('author_id', sa.String(255), nullable=False),
        sa.Column('author_name', sa.String(255), nullable=False),
        sa.Column('followers_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('account_created_at', sa.DateTime(), nullable=True),
        sa.Column('negative_post_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('risk_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('is_flagged', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform', 'author_id', name='uq_authors_platform_author'),
    )
    op.create_index(
        'idx_authors_risk_flagged',
        'tracked_authors',
        [sa.text('risk_score DESC')],
        postgresql_where=sa.text('is_flagged = TRUE'),
    )

    # === attack_clusters table ===
    op.create_table(
        'attack_clusters',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('keyword_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('detected_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('cluster_size', sa.Integer(), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('member_ids', postgresql.ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default="'active'"),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # === reputation_scores table ===
    op.create_table(
        'reputation_scores',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('keyword_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('positive_count', sa.Integer(), nullable=False),
        sa.Column('negative_count', sa.Integer(), nullable=False),
        sa.Column('neutral_count', sa.Integer(), nullable=False),
        sa.Column('total_count', sa.Integer(), nullable=False),
        sa.Column('negative_ratio', sa.Float(), nullable=False),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('computed_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_scores_keyword_time', 'reputation_scores', ['keyword_id', sa.text('computed_at DESC')])

    # === alerts table ===
    op.create_table(
        'alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('keyword_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('alert_type', sa.String(50), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('evidence_url', sa.Text(), nullable=True),
        sa.Column('sent_via', postgresql.ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('triggered_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('alerts')
    op.drop_table('reputation_scores')
    op.drop_table('attack_clusters')
    op.drop_table('tracked_authors')
    op.drop_index('idx_sentiment_post_id', 'sentiment_results')
    op.drop_table('sentiment_results')
    op.drop_index('idx_posts_platform_id', 'posts')
    op.drop_index('idx_posts_posted_at', 'posts')
    op.drop_index('idx_posts_keyword_platform', 'posts')
    op.drop_table('posts')
    op.drop_table('keywords')
