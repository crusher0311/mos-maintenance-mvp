/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'react' {
  export type ReactNode = React.ReactElement | string | number | React.ReactFragment | React.ReactPortal | boolean | null | undefined;
  
  export function forwardRef<T, P = {}>(
    render: (props: P, ref: React.Ref<T>) => React.ReactElement | null
  ): (props: P & React.RefAttributes<T>) => React.ReactElement | null;
  
  export function useState<S>(initialState: S | (() => S)): [S, (value: S | ((prevState: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  
  export interface RefAttributes<T> {
    ref?: Ref<T>;
  }
  
  export type Ref<T> = RefCallback<T> | RefObject<T> | null;
  export type RefCallback<T> = (instance: T | null) => void;
  export interface RefObject<T> {
    readonly current: T | null;
  }
  
  export interface PropsWithChildren<P = {}> {
    children?: ReactNode;
  }
  
  export interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    accept?: string;
    alt?: string;
    autoComplete?: string;
    autoFocus?: boolean;
    capture?: boolean | string;
    checked?: boolean;
    crossOrigin?: string;
    disabled?: boolean;
    form?: string;
    formAction?: string;
    formEncType?: string;
    formMethod?: string;
    formNoValidate?: boolean;
    formTarget?: string;
    height?: number | string;
    list?: string;
    max?: number | string;
    maxLength?: number;
    min?: number | string;
    minLength?: number;
    multiple?: boolean;
    name?: string;
    pattern?: string;
    placeholder?: string;
    readOnly?: boolean;
    required?: boolean;
    size?: number;
    src?: string;
    step?: number | string;
    type?: string;
    value?: string | ReadonlyArray<string> | number;
    width?: number | string;
    onChange?: ChangeEventHandler<T>;
  }
  
  export interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    autoComplete?: string;
    autoFocus?: boolean;
    cols?: number;
    dirName?: string;
    disabled?: boolean;
    form?: string;
    maxLength?: number;
    minLength?: number;
    name?: string;
    placeholder?: string;
    readOnly?: boolean;
    required?: boolean;
    rows?: number;
    value?: string | ReadonlyArray<string> | number;
    wrap?: string;
    onChange?: ChangeEventHandler<T>;
  }
  
  export interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    autoComplete?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    form?: string;
    multiple?: boolean;
    name?: string;
    required?: boolean;
    size?: number;
    value?: string | ReadonlyArray<string> | number;
    onChange?: ChangeEventHandler<T>;
  }
  
  export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    autoFocus?: boolean;
    disabled?: boolean;
    form?: string;
    formAction?: string;
    formEncType?: string;
    formMethod?: string;
    formNoValidate?: boolean;
    formTarget?: string;
    name?: string;
    type?: 'submit' | 'reset' | 'button';
    value?: string | ReadonlyArray<string> | number;
  }
  
  export interface HTMLAttributes<T> {
    className?: string;
    id?: string;
    style?: CSSProperties;
    onClick?: MouseEventHandler<T>;
    onFocus?: FocusEventHandler<T>;
    onBlur?: FocusEventHandler<T>;
    children?: ReactNode;
  }
  
  export interface CSSProperties {
    [key: string]: any;
  }
  
  export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>;
  export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>;
  export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>;
  export type EventHandler<E extends SyntheticEvent<any>> = (event: E) => void;
  
  export interface SyntheticEvent<T = Element, E = Event> {
    currentTarget: T;
    target: EventTarget & T;
    stopPropagation(): void;
    preventDefault(): void;
  }
  
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T;
  }
  
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, NativeMouseEvent> {
    button: number;
    buttons: number;
    clientX: number;
    clientY: number;
  }
  
  export interface FocusEvent<T = Element> extends SyntheticEvent<T, NativeFocusEvent> {
    relatedTarget: EventTarget | null;
    target: EventTarget & T;
  }
  
  namespace React {
    export type ReactNode = ReactElement | string | number | ReactFragment | ReactPortal | boolean | null | undefined;
    export interface ReactElement {}
    export interface ReactFragment {}
    export interface ReactPortal {}
    export interface Component {}
    export interface FC<P = {}> {
      (props: P & { children?: ReactNode }): ReactElement | null;
    }
    export interface ComponentProps<T> {}
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface Element extends React.ReactElement<any, any> {}
}

declare module 'next/link' {
  import { ReactNode } from 'react';
  
  interface LinkProps {
    href: string;
    children: ReactNode;
    className?: string;
    onClick?: () => void;
  }
  
  export default function Link(props: LinkProps): JSX.Element;
}

declare module 'next/navigation' {
  export function usePathname(): string;
}