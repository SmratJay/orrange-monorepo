// Utility functions for the UI library
export { cn } from './utils/cn';

// Basic types
export interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface VariantProps<T = {}> extends ComponentProps {
  variant?: keyof T;
  size?: 'sm' | 'md' | 'lg';
}
