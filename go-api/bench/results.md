Micro benchmark, 2026-10-09: 8 s per route, 64 concurrent requests, 16 accounts, 2000 live sockets.

| | rust | go | go tuned |
|---|---|---|---|
| Image (MiB) | 119.3 | 15.9 | 15.9 |
| RSS idle (MiB) | 32.4 | 26.6 | 24.6 |
| RSS after 16 sign-ups (MiB) | 32.7 | 473.7 | 86.8 |
| Peak RSS during sign-ups (MiB) | 287.7 | 473.9 | 277.9 |
| 16 sign-ups (ms) | 547 | 768 | 1279 |
| RSS after HTTP load (MiB) | 45.7 | 136.5 | 56.6 |
| RSS with 2000 sockets (MiB) | 56.4 (2000 ready) | 119.2 (2000 ready) | 88.5 (2000 ready) |
| Peak RSS overall (MiB) | 287.7 | 479.6 | 277.9 |
| RSS at the end (MiB) | 56.4 | 120 | 83.2 |
| Threads under sockets | 6 | 31 | 11 |
| GET /api/health req/s · p50/p99 ms · errors | 82530 · 0.75/1.54 · 0 | 80027 · 0.71/1.91 · 0 | 77128 · 0.76/2.57 · 0 |
| POST /api/solves req/s · p50/p99 ms · errors | 16555 · 3.49/9.55 · 0 | 4596 · 12.58/80.02 · 0 | 4794 · 12.36/80.61 · 0 |
| GET /api/solves req/s · p50/p99 ms · errors | 2370 · 24.61/46.33 · 0 | 3347 · 18.15/64.92 · 0 | 3395 · 17.72/65.47 · 0 |
| GET /api/stats req/s · p50/p99 ms · errors | 50970 · 0.85/13.03 · 0 | 19803 · 1.88/49.71 · 0 | 20122 · 1.92/49.02 · 0 |
| GET /api/cases req/s · p50/p99 ms · errors | 613 · 104.04/189.63 · 0 | 1898 · 28.2/99.39 · 0 | 401 · 139.7/496 · 0 |
