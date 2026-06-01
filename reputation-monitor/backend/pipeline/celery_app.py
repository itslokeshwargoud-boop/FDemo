from celery import Celery
from celery.schedules import crontab
from core.config import settings

app = Celery('reputation_monitor')

app.conf.update(
    broker_url=settings.REDIS_URL,
    result_backend=settings.REDIS_URL.replace('/0', '/1'),
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
    task_routes={
        'pipeline.tasks.collect_task.*': {'queue': 'collection'},
        'pipeline.tasks.process_task.*': {'queue': 'processing'},
        'pipeline.tasks.analyze_task.*': {'queue': 'analysis'},
        'pipeline.tasks.detection_task.*': {'queue': 'detection'},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
)
