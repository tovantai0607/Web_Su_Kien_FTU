import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, LoaderCircle, ArrowUpRight, Search } from 'lucide-react';
import {
  forwardRef,
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
export function cn(...args: ClassValue[]) {
  return twMerge(clsx(args));
}
const variants = cva('button', {
  variants: {
    variant: { primary: 'button-primary', outline: 'button-outline', ghost: 'button-ghost' },
    size: { default: '', small: 'button-small' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }
>(({ className, variant, size, asChild, ...props }, ref) => {
  const Component = asChild ? Slot : 'button';
  return <Component ref={ref} className={cn(variants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
Input.displayName = 'Input';
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const hintId = id + '-hint',
    errorId = id + '-error';
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
      {hint && <small id={hintId}>{hint}</small>}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={cn('badge', className)}>{children}</span>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}
export function SectionHeading({
  kicker,
  title,
  description,
  children,
}: {
  kicker?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Xem nội dung và xác nhận lựa chọn của bạn.
          </Dialog.Description>
          <Dialog.Close className="modal-close" aria-label="Đóng">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Spinner() {
  return (
    <span role="status" className="loading">
      <LoaderCircle className="spin" size={20} /> Đang tải…
    </span>
  );
}
export function Skeleton() {
  return <div className="skeleton" aria-label="Đang tải nội dung" />;
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </Card>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
export function SearchBar({
  value,
  onChange,
  placeholder = 'Tìm kiếm…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={19} />
      <Input
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
}) {
  return (
    <nav aria-label="Phân trang" className="pagination">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trước
      </Button>
      <span>
        {page} / {Math.max(1, pages)}
      </span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Sau
      </Button>
    </nav>
  );
}
export { ArrowUpRight };
