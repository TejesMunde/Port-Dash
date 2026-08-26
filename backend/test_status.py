"""Checks for rule verification state mapping.

Run: python test_status.py
"""
import os
import tempfile

os.environ.setdefault("DB_PATH", os.path.join(tempfile.gettempdir(), "pf_status_check.db"))

from main import _firewall_state  # noqa: E402

OPEN_2208 = {"fromPort": 2208, "toPort": 2208, "protocol": "tcp", "state": "open"}
OPEN_RANGE = {"fromPort": 27015, "toPort": 27020, "protocol": "udp", "state": "open"}


def check():
    # no AWS access at all -> we must say so, never guess "open"
    assert _firewall_state(2208, "tcp", None, "LIGHTSAIL_INSTANCE not set")[0] == "unconfigured"
    assert _firewall_state(2208, "tcp", None, "boom")[1] == "boom"

    # exact single-port match
    assert _firewall_state(2208, "tcp", [OPEN_2208], "ok")[0] == "open"

    # a port AWS never opened -> closed, which is the 2208 bug this was built for
    assert _firewall_state(2209, "tcp", [OPEN_2208], "ok")[0] == "closed"
    assert _firewall_state(2208, "tcp", [], "ok")[0] == "closed"

    # protocol must match: an open tcp port does not open the udp one
    assert _firewall_state(2208, "udp", [OPEN_2208], "ok")[0] == "closed"

    # ranges: Lightsail reports fromPort..toPort, inclusive on both ends
    for port in (27015, 27017, 27020):
        assert _firewall_state(port, "udp", [OPEN_RANGE], "ok")[0] == "open"
    for port in (27014, 27021):
        assert _firewall_state(port, "udp", [OPEN_RANGE], "ok")[0] == "closed"

    # a rule present but not in "open" state is not open
    shut = dict(OPEN_2208, state="closed")
    assert _firewall_state(2208, "tcp", [shut], "ok")[0] == "closed"

    # first matching open range wins even when a non-matching entry precedes it
    assert _firewall_state(2208, "tcp", [OPEN_RANGE, OPEN_2208], "ok")[0] == "open"

    print("status checks ok")


check()
