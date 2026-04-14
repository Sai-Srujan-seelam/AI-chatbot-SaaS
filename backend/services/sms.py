"""SMS service using Twilio. Falls back to logging if not configured."""

import asyncio
import logging
from functools import partial
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_twilio_client = None


def _twilio_configured() -> bool:
    return bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_phone_number
    )


def _get_twilio_client():
    global _twilio_client
    if _twilio_client is None:
        try:
            from twilio.rest import Client
            _twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        except ImportError:
            logger.warning("twilio package not installed. SMS will be logged only.")
            return None
    return _twilio_client


def _send_sms_sync(to_phone: str, body: str):
    if not _twilio_configured():
        logger.info(f"Twilio not configured. Would have sent SMS to {to_phone}: {body[:100]}")
        return

    client = _get_twilio_client()
    if not client:
        return

    try:
        message = client.messages.create(
            body=body,
            from_=settings.twilio_phone_number,
            to=to_phone,
        )
        logger.info(f"SMS sent to {to_phone}: SID={message.sid}")
    except Exception as e:
        logger.error(f"Failed to send SMS to {to_phone}: {e}")


async def send_sms(to_phone: str, body: str):
    """Non-blocking SMS send."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, partial(_send_sms_sync, to_phone, body))
