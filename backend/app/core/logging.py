"""Structured security and audit logging for ThermoCell-AI."""
from __future__ import annotations

import logging
import sys
from typing import Any, Dict

# Create dedicated security audit logger
security_logger = logging.getLogger("thermocell.security")

# Configure logger format
if not security_logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    security_logger.addHandler(handler)
    security_logger.setLevel(logging.INFO)


def log_security_event(event_type: str, details: Dict[str, Any], level: int = logging.INFO) -> None:
    """
    Log structured security events.
    Never includes raw passwords, auth secrets, or private keys.
    """
    safe_details = {k: v for k, v in details.items() if k not in ("password", "secret", "token")}
    msg = f"event={event_type} " + " ".join(f"{k}={v}" for k, v in safe_details.items())
    security_logger.log(level, msg)
