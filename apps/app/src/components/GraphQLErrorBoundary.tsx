import { Component } from 'react';
import { StateView } from '@/components/ui/StateView';
import { formatGraphQLError } from '@/relay/network';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';

type Props = PropsWithChildren<{ onRetry: () => void }>;
type State = { error: unknown };

export class GraphQLErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Relay render error', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <StateView
          actionLabel="다시 시도"
          description={formatGraphQLError(this.state.error)}
          onAction={this.retry}
          title="화면을 불러오지 못했어요"
        />
      );
    }

    return this.props.children;
  }
}
