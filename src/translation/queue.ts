export class BoundedAsyncQueue {
  private readonly buckets = new Map<string, Array<() => Promise<void>>>();
  private readonly keyOrder: string[] = [];
  private cursor = 0;
  private running = 0;

  constructor(
    private readonly concurrency: number,
    private readonly limit: number,
  ) {}

  get depth(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.length;
    }
    return total;
  }

  get active(): number {
    return this.running;
  }

  tryEnqueue(task: () => Promise<void>, scheduleKey = "_"): boolean {
    if (this.depth + this.running >= this.limit) {
      return false;
    }
    let bucket = this.buckets.get(scheduleKey);
    if (!bucket) {
      bucket = [];
      this.buckets.set(scheduleKey, bucket);
      this.keyOrder.push(scheduleKey);
    }
    bucket.push(task);
    this.pump();
    return true;
  }

  private takeNext(): (() => Promise<void>) | undefined {
    if (this.keyOrder.length === 0) {
      return undefined;
    }
    for (let offset = 0; offset < this.keyOrder.length; offset += 1) {
      const index = (this.cursor + offset) % this.keyOrder.length;
      const key = this.keyOrder[index];
      if (!key) {
        continue;
      }
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.length === 0) {
        continue;
      }
      const task = bucket.shift();
      if (bucket.length === 0) {
        this.buckets.delete(key);
        this.keyOrder.splice(index, 1);
        this.cursor =
          this.keyOrder.length === 0 ? 0 : index % this.keyOrder.length;
      } else {
        this.cursor = (index + 1) % this.keyOrder.length;
      }
      return task;
    }
    return undefined;
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const task = this.takeNext();
      if (!task) {
        return;
      }
      this.running += 1;
      void task().finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}
