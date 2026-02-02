import { createFileRoute, Outlet } from '@tanstack/react-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import MenuNavbar from '@/components/menu/navbar';
import WritePage from '@/components/post/WritePage';
import { MainLayout_Query } from '@/relay/MainLayout_Query.graphql';

export const Route = createFileRoute('/_main')({
  component: MainLayout,
});

function MainLayout() {
  const query = useLazyLoadQuery<MainLayout_Query>(
    graphql`
      query MainLayout_Query {
        ...Navbar_Fragment
        ...WritePage_Query_Fragment
      }
    `,
    {},
  );

  return (
    <div className="flex min-h-screen justify-center">
      <div className="mb-[env(safe-area-inset-bottom)] mt-[env(safe-area-inset-top)] flex w-full max-w-7xl">
        <MenuNavbar query={query} />
        <main className="max-w-screen flex-1">
          <Outlet />
        </main>
        <aside className="@container hidden w-80 xl:block">
          <div className="fixed flex min-h-full w-[100cqw] flex-col gap-4 border-l p-4">
            <WritePage query={query} />
          </div>
        </aside>
      </div>
    </div>
  );
}
