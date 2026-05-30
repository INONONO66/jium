// src/harness/llm-trace-sink.ts
var activeSink = null;
function setLlmTraceSink(sink) {
  activeSink = sink;
}
function getLlmTraceSink() {
  return activeSink;
}
function emitLlmTraceEvent(event) {
  const sink = activeSink;
  if (!sink) return;
  try {
    sink.emit(event);
  } catch {
  }
}
function summarizeTools(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description }));
}
function newLlmTraceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export { emitLlmTraceEvent, getLlmTraceSink, newLlmTraceId, setLlmTraceSink, summarizeTools };
//# sourceMappingURL=llm-trace-sink.js.map
//# sourceMappingURL=llm-trace-sink.js.map