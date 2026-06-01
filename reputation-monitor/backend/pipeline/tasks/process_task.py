"""
Processing pipeline: normalize → deduplicate → language detect → translate → spam filter → strip emojis
"""
import asyncio
import logging
import unicodedata
import re
import uuid
from datetime import datetime
from celery import shared_task
from sqlalchemy import select
import emoji as emoji_lib
from database.connection import AsyncSessionLocal
from models.post import Post
from pipeline.tasks.analyze_task import analyze_posts

logger = logging.getLogger(__name__)


# Step 1: Normalize
def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'\s+', ' ', text)
    return text


# Step 2: Deduplicate - check DB
async def is_duplicate(db, platform: str, post_id: str) -> bool:
    result = await db.execute(
        select(Post).where(Post.platform == platform, Post.post_id == post_id)
    )
    return result.scalar_one_or_none() is not None


# Step 3: Language detection
def detect_language(text: str) -> str:
    try:
        from langdetect import detect
        return detect(text)
    except Exception:
        return 'en'


# Step 4: Translation (non-English → English)
def translate_to_english(text: str, source_lang: str) -> str:
    try:
        from deep_translator import GoogleTranslator
        if len(text) > 5000:
            text = text[:5000]
        translated = GoogleTranslator(source=source_lang, target='en').translate(text)
        return translated or text
    except Exception as e:
        logger.warning(f"Translation failed: {e}")
        return text


# Step 5: Spam filter
def is_spam(text: str) -> bool:
    words = text.split()
    if len(words) < 5:
        return True
    # Check if content is only emojis/URLs
    clean = emoji_lib.replace_emoji(text, '').strip()
    url_pattern = re.compile(r'https?://\S+|www\.\S+')
    clean = url_pattern.sub('', clean).strip()
    if len(clean) < 10:
        return True
    return False


# Step 6: Strip emojis
def strip_emojis(text: str) -> str:
    return emoji_lib.replace_emoji(text, '').strip()


@shared_task(name='pipeline.tasks.process_task.process_posts', bind=True, max_retries=3)
def process_posts(self, keyword_id: str, keyword: str, posts_data: list[dict]):
    """Process collected posts through 6-step pipeline."""
    asyncio.run(_process_posts_async(self, keyword_id, keyword, posts_data))


async def _process_posts_async(task, keyword_id: str, keyword: str, posts_data: list[dict]):
    processed = []

    async with AsyncSessionLocal() as db:
        for post_data in posts_data:
            try:
                # Step 2: Deduplicate
                if await is_duplicate(db, post_data['platform'], post_data['post_id']):
                    continue

                content = post_data['content']

                # Step 1: Normalize
                content = normalize_text(content)

                # Step 3: Language detection
                lang = detect_language(content)
                original_content = content

                # Step 4: Translate if non-English
                if lang != 'en':
                    content = translate_to_english(content, lang)

                # Step 5: Spam filter
                if is_spam(content):
                    continue

                # Step 6: Strip emojis before sending to ML model
                content_for_analysis = strip_emojis(content)

                posted_at = (
                    datetime.fromisoformat(post_data['posted_at'])
                    if isinstance(post_data['posted_at'], str)
                    else post_data['posted_at']
                )

                # Save to DB
                post = Post(
                    id=uuid.uuid4(),
                    keyword_id=uuid.UUID(keyword_id),
                    platform=post_data['platform'],
                    post_id=post_data['post_id'],
                    author_id=post_data['author_id'],
                    author_name=post_data['author_name'],
                    followers_count=post_data['followers_count'],
                    content=original_content,
                    posted_at=posted_at,
                    url=post_data['url'],
                    likes_count=post_data.get('likes_count', 0),
                    replies_count=post_data.get('replies_count', 0),
                    shares_count=post_data.get('shares_count', 0),
                    language=lang,
                )
                db.add(post)
                await db.flush()  # Get the ID

                processed.append({
                    **post_data,
                    'db_post_id': str(post.id),
                    'content_for_analysis': content_for_analysis,
                    'language': lang,
                })

            except Exception as e:
                logger.error(f"Error processing post {post_data.get('post_id')}: {e}")

        await db.commit()

    logger.info(f"Processed {len(processed)} posts for keyword_id {keyword_id}")

    if processed:
        analyze_posts.delay(keyword_id, keyword, processed)
