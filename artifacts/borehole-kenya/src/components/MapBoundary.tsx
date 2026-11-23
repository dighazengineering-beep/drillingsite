import { Component, type ReactNode } from "react";

/** If the map cannot load (for example the page is older than the latest update), show a short message instead of a blank page. */
export class MapBoundary extends Component<{ children: ReactNode; onClose?: () => void }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() {
    if (!this.state.bad) return this.props.children;
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
        <div className="max-w-sm rounded-2xl bg-card p-5 text-center shadow-xl">
          <p className="font-bold text-foreground">The map could not open</p>
          <p className="mt-1 text-sm text-muted-foreground">The page may be out of date. Reload it and try again. You can also type the coordinates.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => location.reload()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Reload</button>
            <button type="button" onClick={() => { this.setState({ bad: false }); this.props.onClose?.(); }} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Close</button>
          </div>
        </div>
      </div>
    );
  }
}
