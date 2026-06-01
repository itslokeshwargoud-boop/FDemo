"""SMTP email alert sender."""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import settings

logger = logging.getLogger(__name__)


class EmailAlert:
    async def send(self, subject: str, body: str, to_email: str | None = None):
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            logger.debug("SMTP not configured, skipping email alert")
            return
        recipient = to_email or settings.ALERT_FROM_EMAIL
        if not recipient:
            return
        await asyncio.get_event_loop().run_in_executor(None, self._send_sync, subject, body, recipient)

    def _send_sync(self, subject: str, body: str, to_email: str):
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = settings.ALERT_FROM_EMAIL
        msg['To'] = to_email
        msg.attach(MIMEText(body, 'plain'))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.ALERT_FROM_EMAIL, to_email, msg.as_string())
        logger.info(f"Email alert sent to {to_email}: {subject}")
