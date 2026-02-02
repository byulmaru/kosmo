import { Button } from '@base-ui/react/button';
import { ReactNode } from 'react';
import { cn } from 'tailwind-variants';

type Props = {
  children: ReactNode;
  className?: string;
} & Button.Props;

export default function IconButton({ children, className, ...props }: Props) {
  return (
    <Button
      className={cn('hover:bg-accent rounded-full p-2 hover:cursor-pointer', className)}
      {...props}
    >
      {children}
    </Button>
  );
}
