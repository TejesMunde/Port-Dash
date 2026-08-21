"""Checks for the Range header parsing behind the background video.

Run: python test_range.py
"""
import os
import tempfile

# main.py mkdirs DB_PATH's parent at import time; keep that out of /var on a dev box.
os.environ.setdefault("DB_PATH", os.path.join(tempfile.gettempdir(), "pf_range_check.db"))

from main import _parse_range  # noqa: E402

SIZE = 39729448


def check():
    # no header, or a unit we do not speak -> serve the whole file
    assert _parse_range(None, SIZE) is None
    assert _parse_range("", SIZE) is None
    assert _parse_range("items=0-10", SIZE) is None

    # ordinary range
    assert _parse_range("bytes=0-1023", SIZE) == (0, 1023)
    assert _parse_range("BYTES=0-1023", SIZE) == (0, 1023)

    # open-ended: browsers send this constantly while streaming
    assert _parse_range("bytes=500-", SIZE) == (500, SIZE - 1)

    # suffix form: last N bytes. mp4 moov atom probing uses this.
    assert _parse_range("bytes=-500", SIZE) == (SIZE - 500, SIZE - 1)

    # end past EOF clamps rather than over-reading
    assert _parse_range("bytes=0-99999999", SIZE) == (0, SIZE - 1)

    # only the first range of a multi-range request is honoured
    assert _parse_range("bytes=0-10,20-30", SIZE) == (0, 10)

    # unsatisfiable -> 416
    for bad in ("bytes=%d-" % SIZE, "bytes=%d-" % (SIZE + 10), "bytes=-0", "bytes=20-10"):
        try:
            _parse_range(bad, SIZE)
            raise AssertionError("expected ValueError for %r" % bad)
        except ValueError:
            pass

    # junk -> treat as no range rather than blowing up
    assert _parse_range("bytes=abc-def", SIZE) is None
    assert _parse_range("bytes=-", SIZE) is None

    # length arithmetic is inclusive on both ends
    start, end = _parse_range("bytes=0-1023", SIZE)
    assert end - start + 1 == 1024

    print("range checks ok")


check()
