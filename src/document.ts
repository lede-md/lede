export type ViewMode = 'source' | 'preview';

export class Document {
  path: string;
  content: string;
  view: ViewMode;
  isUntitled: boolean;
  private savedContent: string;

  constructor(path: string, content: string, view: ViewMode = 'preview') {
    this.path = path;
    this.content = content;
    this.savedContent = content;
    this.view = view;
    this.isUntitled = false;
  }

  static untitled(seq: number): Document {
    const doc = new Document(`untitled-${seq}`, '', 'source');
    doc.isUntitled = true;
    return doc;
  }

  assignPath(path: string): void {
    this.path = path;
    this.isUntitled = false;
  }

  get dirty(): boolean {
    return this.content !== this.savedContent;
  }

  setContent(next: string): void {
    this.content = next;
  }

  markSaved(): void {
    this.savedContent = this.content;
  }

  reload(next: string): void {
    this.content = next;
    this.savedContent = next;
  }
}
