// src/harness/validator-trace-sink.ts
var activeSink = null;
function setValidatorTraceSink(sink) {
  activeSink = sink;
}
function getValidatorTraceSink() {
  return activeSink;
}
function emitValidatorTraceEvent(event) {
  const sink = activeSink;
  if (!sink) return;
  try {
    sink.emit(event);
  } catch {
  }
}
function truncateSourceForTrace(source) {
  const cap = 16 * 1024;
  if (source.length <= cap) return source;
  return source.slice(0, cap) + "\n\n/* \u2026 truncated for devtools trace \u2026 */";
}
function newValidatorTraceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export { emitValidatorTraceEvent, getValidatorTraceSink, newValidatorTraceId, setValidatorTraceSink, truncateSourceForTrace };
//# sourceMappingURL=validator-trace-sink.js.map
//# sourceMappingURL=validator-trace-sink.js.map