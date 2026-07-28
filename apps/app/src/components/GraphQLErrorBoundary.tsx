import { GraphQLErrorBoundaryBase } from './GraphQLErrorBoundaryBase';
import type { GraphQLErrorBoundaryProps } from './GraphQLErrorBoundaryBase';

export function GraphQLErrorBoundary(props: GraphQLErrorBoundaryProps) {
  return <GraphQLErrorBoundaryBase {...props} />;
}
