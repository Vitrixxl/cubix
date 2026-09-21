/** Sessions live for one app launch. Failed creations can be retried. */
export class LaunchSessions {
  private ids = new Map<string, number>();
  private pending = new Map<string, Promise<number>>();
  get(key: string): number | undefined { return this.ids.get(key); }
  ensure(key: string, create: () => Promise<{ id: number }>): Promise<number> {
    const id = this.ids.get(key);
    if (id !== undefined) return Promise.resolve(id);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(create).then(session => {
      // A logout may have cleared this registry while creation was in flight.
      if (this.pending.get(key) === request) this.ids.set(key, session.id);
      return session.id;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
  clear() { this.ids.clear(); this.pending.clear(); }
}
