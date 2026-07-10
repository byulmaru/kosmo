import { Component, Suspense } from 'react';
import { StateView } from '@/components/ui/StateView';
import type { ErrorInfo, ReactNode } from 'react';

type ProfileRouteBoundaryProps = {
  children: ReactNode;
  loading: ReactNode;
  onRetry: () => void;
  title: string;
};

type ProfileRouteBoundaryState = { failed: boolean };

export class ProfileRouteBoundary extends Component<
  ProfileRouteBoundaryProps,
  ProfileRouteBoundaryState
> {
  state = { failed: false };

  static getDerivedStateFromError(): ProfileRouteBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Profile route error', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false });
    this.props.onRetry();
  };

  render() {
    if (this.state.failed) {
      return (
        <StateView
          actionLabel="다시 시도"
          description="잠시 후 다시 시도해주세요."
          onAction={this.retry}
          title={this.props.title}
        />
      );
    }

    return <Suspense fallback={this.props.loading}>{this.props.children}</Suspense>;
  }
}
