import { Link } from '@tanstack/react-router';
import { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { cn } from 'tailwind-variants';

type MenuButtonProps = {
  canCollapse?: boolean;
  visible?: boolean;
  Icon: ComponentType<{ className?: string }>;
  children: ReactNode;
} & (
  | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
  | ButtonHTMLAttributes<HTMLButtonElement>
);

export default function MenuButton({
  canCollapse = true,
  visible = true,
  Icon,
  children,
  className,
  ...props
}: MenuButtonProps) {
  return (
    visible &&
    ('href' in props ? (
      <Link
        to={props.href}
        className={cn(
          'hover:bg-muted flex flex-row items-center gap-4 p-4 font-medium',
          className,
          canCollapse ? 'justify-center lg:justify-start' : 'justify-start',
          className,
        )}
        tabIndex={0}
        {...props}
      >
        <Icon className="size-6" />
        <span className={cn('text-lg', canCollapse ? 'sr-only lg:not-sr-only' : 'inline')}>
          {children}
        </span>
      </Link>
    ) : (
      <button
        className={cn(
          'hover:bg-muted flex flex-row items-center gap-4 p-4 font-medium',
          className,
          canCollapse ? 'justify-center lg:justify-start' : 'justify-start',
          className,
        )}
        {...props}
      >
        <Icon className="size-6" />
        <span className={cn('text-lg', canCollapse ? 'sr-only lg:not-sr-only' : 'inline')}>
          {children}
        </span>
      </button>
    ))
  );
}
