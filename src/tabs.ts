import { Document } from './document';

export class TabSet {
  readonly docs: Document[] = [];
  activeIndex = -1;

  get active(): Document | null {
    return this.activeIndex >= 0 ? this.docs[this.activeIndex] : null;
  }

  get isEmpty(): boolean {
    return this.docs.length === 0;
  }

  findByPath(path: string): number {
    return this.docs.findIndex((d) => d.path === path);
  }

  open(doc: Document): number {
    const existing = this.findByPath(doc.path);
    if (existing >= 0) {
      this.activeIndex = existing;
      return existing;
    }
    this.docs.push(doc);
    this.activeIndex = this.docs.length - 1;
    return this.activeIndex;
  }

  activate(index: number): void {
    if (index >= 0 && index < this.docs.length) this.activeIndex = index;
  }

  close(index: number): void {
    if (index < 0 || index >= this.docs.length) return;
    this.docs.splice(index, 1);
    if (this.docs.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex >= this.docs.length) {
      this.activeIndex = this.docs.length - 1;
    } else if (index < this.activeIndex) {
      this.activeIndex -= 1;
    }
  }
}
