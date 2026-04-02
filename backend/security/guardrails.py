import re

# Patterns that indicate prompt injection attempts
INJECTION_PATTERNS = [
    r"(?i)(ignore|disregard|forget)\s+(all\s+)?(previous\s+)?(instructions|prompt|rules|context)",
    r"(?i)you\s+are\s+now",
    r"(?i)new\s+(instructions|persona|role|identity)",
    r"(?i)(reveal|show|print|output|display)\s+(your\s+)?(system\s+)?(prompt|instructions)",
    r"(?i)pretend\s+(you\s+are|to\s+be)",
    r"(?i)act\s+as\s+(if|though)",
    r"(?i)override\s+(your|the)\s+(rules|instructions|programming)",
    r"(?i)jailbreak",
    r"(?i)do\s+anything\s+now",
    r"(?i)DAN\s+mode",
]

# Phrases that indicate the LLM leaked its system prompt
LEAKED_PROMPT_PHRASES = [
    "my instructions say",
    "my instructions are",
    "i was told to",
    "my system prompt",
    "i'm programmed to",
    "my programming says",
    "according to my instructions",
    "my rules state",
]


def validate_user_input(message: str) -> str:
    """Sanitize and validate user message."""
    if not message or not message.strip():
        raise ValueError("Message cannot be empty")

    # Length cap
    message = message[:500]

    # Strip control characters but keep newlines and tabs
    message = "".join(c for c in message if c.isprintable() or c in "\n\t")

    return message.strip()


def check_injection_attempt(message: str) -> bool:
    """Return True if the message looks like a prompt injection attempt."""
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, message):
            return True
    return False


def validate_response(response: str, tenant_name: str) -> str:
    """Check if the LLM response leaked system prompt details."""
    response_lower = response.lower()
    for phrase in LEAKED_PROMPT_PHRASES:
        if phrase in response_lower:
            return (
                f"I can help you with questions about {tenant_name}. "
                "What would you like to know?"
            )
    return response
