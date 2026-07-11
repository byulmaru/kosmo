import { Component, Suspense } from 'react';
import { StateView } from '@/components/ui/StateView';
import type { ErrorInfo, ReactNode } from 'react';

type RouteBoundaryProps = {
  children: ReactNode;
  description?: string;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  onRetry: () => void;
  title: string;
};

type RouteBoundaryState = { failed: boolean };

export class RouteBoundary extends Component<RouteBoundaryProps, RouteBoundaryState> {
  state = { failed: false };

  static getDerivedStateFromError(): RouteBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Route error', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false });
    this.props.onRetry();
  };

  render() {
    if (this.state.failed) {
      if (this.props.error) {
        return this.props.error(this.retry);
      }

      return (
        <StateView
          actionLabel="다시 시도"
          alert
          description={this.props.description ?? '잠시 후 다시 시도해주세요.'}
          onAction={this.retry}
          title={this.props.title}
        />
      );
    }

    return <Suspense fallback={this.props.loading}>{this.props.children}</Suspense>;
  }
}
