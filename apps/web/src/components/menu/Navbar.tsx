'use client';

import { HouseIcon, MenuIcon, SparklesIcon } from 'lucide-react';
import { graphql, useFragment } from 'react-relay';
import { cn } from 'tailwind-variants';
import { Navbar_Fragment$key } from '$relay/Navbar_Fragment.graphql';
import MenuButton from './button';
import MenuContent from './MenuContent';

type Props = {
  query: Navbar_Fragment$key;
};

export default function Navbar({ query: query$key }: Props) {
  const query = useFragment(
    graphql`
      fragment Navbar_Fragment on Query {
        ...MenuContent_Fragment
      }
    `,
    query$key,
  );

  return (
    <>
      {/* PC Sidebar */}
      <nav className="w-18 hidden h-full sm:block lg:w-60">
        <div
          className={cn(
            'w-18 z-100 bg-background fixed hidden h-full flex-col overflow-y-auto overflow-x-hidden border-r pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:flex lg:w-60',
          )}
        >
          <div className="hidden w-full flex-row items-center justify-start gap-4 p-4 text-xl font-semibold lg:flex">
            <SparklesIcon className="size-6" />
          </div>
          <nav className="flex flex-1 flex-col">
            <MenuContent kind="sidebar" query={query} />
          </nav>
        </div>
      </nav>
      {/* Mobile Bottom Navbar */}
      <nav className="bg-background fixed bottom-0 left-0 right-0 z-50 border-t pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="flex w-full items-stretch overflow-x-auto">
          <MenuButton className="flex-1" href="/" Icon={HouseIcon}>
            홈
          </MenuButton>
          <MenuButton className="flex-1" href="/menu" Icon={MenuIcon}>
            메뉴
          </MenuButton>
        </div>
      </nav>
    </>
  );
}
