# ResQOS

ResQOS is an educational emergency response and operating systems simulator. The existing module pages remain available, and the Overview now hosts a deterministic, tick based command centre where alerts pass through a shared buffer, memory admission, Banker safety checks, CPU scheduling, and resource release.

## Run locally

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Run the automated checks and production build with:

```sh
npm test
npm run build
```

## Live command centre

- Play, pause, step, reset, and set speed to 0.5x, 1x, 2x, or 5x.
- Choose Normal Day, Peak Demand / Disaster Surge, or Resource Crunch; the alert generator uses a fixed seed per preset for reproducible runs.
- Trigger a burst of emergency alerts from ambulance, fire, police, call centre, and sensor sources. Alerts carry severity, CPU burst, memory demand, priority, and resource claims.
- Producers insert into a bounded FIFO buffer. The dispatcher consumes alerts, requests a variable-sized memory block, and runs Banker safety before granting resource claims. Admitted work enters the configured CPU policy; completion returns memory and resources.
- Select FCFS, SJF, Priority, Preemptive Priority, or Round Robin. Priority aging is configurable. The dashboard shows the live Gantt history, ready/running tasks, buffer semaphores, resource ledger, memory map, event trace, metrics, and a same-seed policy comparison. Export completed task metrics as CSV.
- Memory compaction moves allocated blocks together and coalesces the remaining free space. The unsafe request demo runs a known unsafe Banker state without mutating the live resource ledger.

The live simulator is a single-threaded, deterministic discrete-event model. Mutex and semaphore actions are logged as simulation events; no operating-system threads or external emergency services are used. The dashboard engine state persists while navigating between the existing module pages, but the older CPU, buffer, memory, and Banker detail forms remain independent teaching scenarios.

## Existing module pages

- **CPU Scheduling:** FCFS, non-preemptive SJF/Priority, Round Robin, preemptive priority with optional aging, Gantt timeline, and process metrics.
- **Producer–Consumer:** manually controlled bounded FIFO buffer, semaphore counts, mutex state, and event log.
- **Memory Management:** First Fit, Best Fit, Worst Fit, allocation, release, fragmentation accounting, and resize.
- **Banker’s Algorithm:** editable matrices, Need calculation, safety trace, request validation, safe/unsafe sample states, and rollback.

The emergency process directory remains shared with the legacy module pages and persists in local storage. The live command centre generates its own reproducible alert stream.

## Three minute demo

1. On Overview, select **Peak Demand / Disaster Surge**, then press **Step** twice. Point out the alert source, bounded slots, semaphore counts, and the generated event log.
2. Press **Play** or **Trigger disaster**. Watch an alert leave the FIFO buffer, pass memory and Banker admission, run on the CPU Gantt chart, and return its resources at completion.
3. Change CPU policy to **Round Robin**, turn Priority aging on, and use **Step** to inspect dispatch behavior. Use **Compact memory** and the **Unsafe request demo** to show fragmentation cleanup and a rejected unsafe state.
4. Review the policy comparison and click **Export CSV report** after work completes. Open the CPU, Producer–Consumer, Memory, and Banker pages to inspect their editable standalone examples.
# MINI-Project
