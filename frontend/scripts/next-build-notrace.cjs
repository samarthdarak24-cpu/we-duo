// Optional build helper: neutralise Next.js's diagnostic trace writer.
//
// Why this exists
// ---------------
// On some Windows hosts, Next's RotatingWriteStream opens `<distDir>/trace`
// for append from several build workers; one of those opens returns EPERM and
// the resulting uncaughtException aborts an otherwise successful build. The
// trace file is build diagnostics only and has no effect on emitted bundles.
//
// This preload substitutes an in-memory sink for that single path. Nothing
// else is patched. It is NOT required on normal CI runners or Linux/macOS.
//
// Usage (bash):
//   NODE_OPTIONS="--require ./scripts/next-build-notrace.cjs" \
//   NEXT_DIST_DIR=.next_verify npm run build
const fs = require("fs");
const { Writable } = require("stream");

const original = fs.createWriteStream;
const TRACE_RE = /[\\/]\.next[^\\/]*[\\/]trace$/;

fs.createWriteStream = function patchedCreateWriteStream(target, options) {
  const p = typeof target === "string" ? target : String(target);
  if (TRACE_RE.test(p)) {
    const sink = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    process.nextTick(() => sink.emit("open", 1));
    return sink;
  }
  return original.call(this, target, options);
};
