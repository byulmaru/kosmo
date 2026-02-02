import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_main/@{$handle}/following')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_main/"!</div>;
}
