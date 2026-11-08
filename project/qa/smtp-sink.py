"""Local SMTP sink for integration tests.

Usage: python qa/smtp-sink.py <output-dir> <port>

Writes every accepted message as an .eml file so a test can assert what was
actually transmitted. Test-only; not part of the application runtime.
"""
import asyncio
import os
import sys
import time

from aiosmtpd.controller import Controller


OUT = sys.argv[1]
PORT = int(sys.argv[2])
os.makedirs(OUT, exist_ok=True)


class Sink:
    async def handle_DATA(self, server, session, envelope):
        path = os.path.join(OUT, f"msg-{time.time_ns()}.eml")
        with open(path, "wb") as handle:
            handle.write(envelope.original_content)
        print(f"[smtp-sink] accepted {path}", flush=True)
        return "250 Message accepted for delivery"


controller = Controller(Sink(), hostname="127.0.0.1", port=PORT)
controller.start()
print(f"[smtp-sink] listening on 127.0.0.1:{PORT} -> {OUT}", flush=True)
asyncio.get_event_loop().run_forever()
