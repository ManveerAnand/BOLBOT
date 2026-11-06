import { describe, expect, it } from "vitest";
import { BoundedAsyncQueue } from "../../../src/translation/queue";

describe("BoundedAsyncQueue", () => {
  it("round-robins across schedule keys so one message cannot monopolize", async () => {
    const order: string[] = [];
    const queue = new BoundedAsyncQueue(1, 100);
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    expect(
      queue.tryEnqueue(async () => {
        await gate;
        order.push("a1");
      }, "a"),
    ).toBe(true);
    expect(
      queue.tryEnqueue(async () => {
        order.push("b1");
      }, "b"),
    ).toBe(true);
    expect(
      queue.tryEnqueue(async () => {
        order.push("a2");
      }, "a"),
    ).toBe(true);

    releaseFirst();
    const deadline = Date.now() + 2_000;
    while (order.length < 3) {
      if (Date.now() > deadline) {
        throw new Error("waitUntil timeout");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(order).toEqual(["a1", "b1", "a2"]);
  });

  it("rejects work past the configured limit", async () => {
    const queue = new BoundedAsyncQueue(1, 1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    expect(
      queue.tryEnqueue(async () => {
        await gate;
      }),
    ).toBe(true);
    expect(queue.tryEnqueue(async () => undefined)).toBe(false);
    release();
    const deadline = Date.now() + 2_000;
    while (queue.active > 0) {
      if (Date.now() > deadline) {
        throw new Error("queue did not drain");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
});
