from celery.schedules import crontab
from pipeline.celery_app import app
from core.config import settings

app.conf.beat_schedule = {
    'collect-all-active-keywords': {
        'task': 'pipeline.tasks.collect_task.collect_all_active_keywords',
        'schedule': settings.COLLECTION_INTERVAL_SECONDS,  # every 1800 seconds
    },
    'broadcast-stats-for-all-keywords': {
        'task': 'pipeline.tasks.analyze_task.broadcast_stats_for_all_keywords',
        'schedule': settings.STATS_BROADCAST_INTERVAL_SECONDS,  # every 30 seconds
    },
    'compute-daily-scores': {
        'task': 'pipeline.tasks.analyze_task.compute_daily_scores',
        'schedule': crontab(minute=0),  # every hour
    },
}
