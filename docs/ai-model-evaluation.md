# AI model evaluation (not executed)

No model was downloaded or tested for Phase 5. This note records the decision boundary for future evaluation.

| Option | License / size | Marathi/Hindi | Offline / structured output | Decision |
|---|---|---|---|---|
| Deterministic rules | Project code / tiny | Translation-backed | Yes / native | Implemented baseline |
| Task-specific acoustic model | Must review license; varies | Requires benchmark | Possible; adds runtime | Defer until fixtures and benefit are proven |
| Small general local model | License and quantized RAM vary | Must benchmark | Possible with constrained decoding | No download without explicit approval |
| Hosted model | Provider terms and paid/network dependency | Provider-dependent | No | Optional adapter only, never default |

Fine-tuning, training from scratch, agent orchestration, and hosted RAG are not required to explain measured pitch practice and are deferred. A future comparison must record model version, license, hardware, RAM/VRAM, latency, structured-output failure rate, and improvement over deterministic coaching; no such results are claimed here.
