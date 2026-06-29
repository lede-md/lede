export type ActionId = string;
export type ActionHandler = () => void | Promise<void>;

export class ActionRegistry {
  private handlers = new Map<ActionId, ActionHandler>();

  register(id: ActionId, handler: ActionHandler): void {
    this.handlers.set(id, handler);
  }

  has(id: ActionId): boolean {
    return this.handlers.has(id);
  }

  async dispatch(id: ActionId): Promise<void> {
    const h = this.handlers.get(id);
    if (h) await h();
  }
}
