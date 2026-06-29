export type ViewMode = 'source' | 'preview';

export class Document {
  readonly path: string;
  content: string;
  view: ViewMode;
  private savedContent: string;

  constructor(path: string, content: string, view: ViewMode = 'preview') {
    this.path = path;
    this.content = content;
    this.savedContent = content;
    this.view = view;
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
