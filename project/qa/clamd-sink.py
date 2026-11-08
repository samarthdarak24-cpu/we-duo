"""Minimal clamd protocol stub for adapter tests.

Usage: python qa/clamd-sink.py <port> [delay-seconds]

Implements zVERSION and zINSTREAM framing exactly as the clamd socket protocol
does, and returns FOUND when the EICAR test signature is present. This verifies
the application's protocol client; it is NOT a substitute for a real ClamAV
engine and the application reports the engine as `clamav-clamd` only when
TD_CLAMAV_HOST is configured.
"""
import socketserver
import sys
import time

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3310
DELAY = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
VERSION = b"ClamAV 1.4.1/27480/stub-signature-db"


class Reader:
    def __init__(self, sock):
        self.sock = sock
        self.buf = b""

    def read_until(self, marker: bytes) -> bytes:
        while marker not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError
            self.buf += chunk
        head, self.buf = self.buf.split(marker, 1)
        return head

    def read_exact(self, size: int) -> bytes:
        while len(self.buf) < size:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:size], self.buf[size:]
        return out


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        reader = Reader(self.request)
        try:
            command = reader.read_until(b"\0").decode("ascii", "replace").lstrip("z")
            if DELAY:
                time.sleep(DELAY)
            if command == "VERSION":
                self.request.sendall(VERSION + b"\0")
                return
            if command != "INSTREAM":
                self.request.sendall(b"UNKNOWN COMMAND\0")
                return
            payload = bytearray()
            while True:
                size = int.from_bytes(reader.read_exact(4), "big")
                if size == 0:
                    break
                payload += reader.read_exact(size)
            if EICAR in payload:
                self.request.sendall(b"stream: Win.Test.EICAR_HDB-1 FOUND\0")
            else:
                self.request.sendall(b"stream: OK\0")
        except EOFError:
            return


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


with Server(("127.0.0.1", PORT), Handler) as server:
    print(f"[clamd-sink] listening on 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
