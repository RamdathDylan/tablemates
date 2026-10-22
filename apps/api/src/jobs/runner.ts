/**
 * Background jobs: each runs on its own interval, one run at a time, and a
 * failure is logged without stopping the others.
 */
export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

export class JobRunner {
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private jobs: Job[],
    private log: { error: (obj: unknown, msg?: string) => void } = console,
  ) {}

  start() {
    for (const job of this.jobs) {
      let running = false;
      this.timers.push(
        setInterval(async () => {
          if (running) return;
          running = true;
          try {
            await job.run();
          } catch (err) {
            this.log.error(err, `job ${job.name} failed`);
          } finally {
            running = false;
          }
        }, job.intervalMs),
      );
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
