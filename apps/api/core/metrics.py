from prometheus_client import Counter, Gauge

# Custom AI call metrics
ai_calls_total = Counter(
    "ai_calls_total",
    "Total number of OpenAI AI calls executed.",
    ["service", "model"]
)

# Custom active claims metrics
active_claims_gauge = Gauge(
    "active_claims_gauge",
    "Current count of active (unresolved) claims in the system."
)
