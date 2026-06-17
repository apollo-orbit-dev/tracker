// Phase 7.11 (7.10 review carry-over) — minimal error boundary around
// lazy-loaded chunks (the Recharts donut). A chunk-load failure (e.g.
// stale deploy, network drop) renders the muted fallback instead of
// white-screening the whole app.
import { Component, type ReactNode } from "react"

type Props = { fallback: ReactNode; children: ReactNode }
type State = { failed: boolean }

export class LazyBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
