/**
 * Stable priority queue for the discrete-event engine.
 * Ordering is (timeUs, priority, sequenceId): ties never depend on insertion
 * order accidents or array sort instability.
 */

export interface QueueItem<T> {
  timeUs: number;
  priority: number;
  sequenceId: number;
  value: T;
}

export class StablePriorityQueue<T> {
  private heap: Array<QueueItem<T>> = [];
  private nextSequenceId = 0;

  get size(): number {
    return this.heap.length;
  }

  get sequenceCounter(): number {
    return this.nextSequenceId;
  }

  push(value: T, timeUs: number, priority = 0): QueueItem<T> {
    const item: QueueItem<T> = {
      timeUs,
      priority,
      sequenceId: this.nextSequenceId,
      value,
    };
    this.nextSequenceId += 1;
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
    return item;
  }

  peek(): QueueItem<T> | undefined {
    return this.heap[0];
  }

  pop(): QueueItem<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  clear(): void {
    this.heap = [];
    this.nextSequenceId = 0;
  }

  private less(a: QueueItem<T>, b: QueueItem<T>): boolean {
    if (a.timeUs !== b.timeUs) return a.timeUs < b.timeUs;
    if (a.priority !== b.priority) return a.priority < b.priority;
    return a.sequenceId < b.sequenceId;
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.less(this.heap[i]!, this.heap[parent]!)) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
        i = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const n = this.heap.length;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(this.heap[left]!, this.heap[smallest]!)) smallest = left;
      if (right < n && this.less(this.heap[right]!, this.heap[smallest]!)) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest]!, this.heap[i]!];
      i = smallest;
    }
  }
}
