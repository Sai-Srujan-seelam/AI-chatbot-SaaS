"""Email service for lead confirmations and notifications.

Uses SMTP (works with Gmail, SendGrid, Mailgun, AWS SES, etc.).
Configure SMTP_* settings in .env. If SMTP is not configured,
emails are logged but not sent -- the lead is still captured.
"""

import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import partial
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from_email)


def _send_email_sync(to_email: str, subject: str, html_body: str):
    """Send an email via SMTP (synchronous -- run in thread pool)."""
    if not _smtp_configured():
        logger.info(f"SMTP not configured. Would have sent to {to_email}: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)

        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)

        server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        server.quit()
        logger.info(f"Email sent to {to_email}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")


async def _send_email(to_email: str, subject: str, html_body: str):
    """Non-blocking email send."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, partial(_send_email_sync, to_email, subject, html_body)
    )


async def send_lead_confirmation(
    to_email: str,
    visitor_name: str,
    tenant_name: str,
    lead_type: str = "demo",
):
    """Send confirmation email to the visitor who submitted a lead/demo form."""
    type_label = {
        "demo": "demo request",
        "booking": "appointment request",
        "contact": "message",
    }.get(lead_type, "request")

    subject = f"Your {type_label} with {tenant_name} has been received"
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 16px;">Thanks, {visitor_name}!</h2>
        <p style="color: #4b5563; line-height: 1.6;">
            We've received your {type_label}. Someone from <strong>{tenant_name}</strong> will get back to you shortly.
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">
            This is an automated confirmation. No need to reply.
        </p>
    </div>
    """

    await _send_email(to_email, subject, html)


async def send_lead_notification(
    to_email: str,
    visitor_name: str,
    visitor_email: str,
    visitor_phone: str | None,
    message: str | None,
    tenant_name: str,
    lead_type: str = "demo",
):
    """Send notification to the tenant that a new lead came in."""
    type_label = {
        "demo": "Demo Request",
        "booking": "Appointment Request",
        "contact": "Contact Form",
    }.get(lead_type, "New Lead")

    subject = f"New {type_label}: {visitor_name} ({visitor_email})"
    phone_row = f"<tr><td style='padding:8px;color:#6b7280;'>Phone</td><td style='padding:8px;'>{visitor_phone}</td></tr>" if visitor_phone else ""
    message_row = f"<tr><td style='padding:8px;color:#6b7280;'>Message</td><td style='padding:8px;'>{message}</td></tr>" if message else ""

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 16px;">{type_label} from {tenant_name}'s website</h2>
        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px;">
            <tr><td style="padding:8px;color:#6b7280;">Name</td><td style="padding:8px;">{visitor_name}</td></tr>
            <tr><td style="padding:8px;color:#6b7280;">Email</td><td style="padding:8px;"><a href="mailto:{visitor_email}">{visitor_email}</a></td></tr>
            {phone_row}
            {message_row}
        </table>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 16px;">
            Captured via WonderChat widget. Reply directly to the visitor at {visitor_email}.
        </p>
    </div>
    """

    await _send_email(to_email, subject, html)
