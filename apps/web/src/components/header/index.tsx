import { useRouter } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import IconButton from '../IconButton';

type Props = {
  backButton?: boolean;
  children?: React.ReactNode;
};

export default function Header({ backButton, children }: Props) {
  const router = useRouter();

  return (
    <div className="@container h-14 w-full">
      <header className="bg-background/80 fixed top-0 z-50 w-[100cqw] border-b px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-2">
          {backButton && (
            <IconButton onClick={() => router.history.back()}>
              <ArrowLeftIcon />
            </IconButton>
          )}
          {children}
        </div>
      </header>
    </div>
  );
}
