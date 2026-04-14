from celery import Celery
from celery.schedules import crontab

import os
from src.ml import fraud_pass_two
from src.ml import fraud_inference

# Create Celery app FIRST
celery = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

# THEN configure it
celery.conf.beat_schedule = {
    'calculate-premiums-every-sunday': {
        'task': 'tasks.calculate_weekly_premiums',
        'schedule': crontab(hour=23, minute=0, day_of_week='sunday'),
    },
}