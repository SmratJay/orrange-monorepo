import { useState, useCallback } from 'react';

interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

interface FieldConfig<T> {
  required?: boolean;
  rules?: ValidationRule<T>[];
}

interface UseFormValidationProps<T> {
  initialValues: T;
  validationRules: Partial<Record<keyof T, FieldConfig<T[keyof T]>>>;
}

export function useFormValidation<T extends Record<string, any>>({
  initialValues,
  validationRules,
}: UseFormValidationProps<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const validateField = useCallback((field: keyof T, value: T[keyof T]): string | null => {
    const config = validationRules[field];
    if (!config) return null;

    // Required validation
    if (config.required && (!value || (typeof value === 'string' && !value.trim()))) {
      return `${String(field)} is required`;
    }

    // Custom rules
    if (config.rules) {
      for (const rule of config.rules) {
        if (!rule.validate(value)) {
          return rule.message;
        }
      }
    }

    return null;
  }, [validationRules]);

  const setValue = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const setFieldTouched = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(values).forEach(key => {
      const field = key as keyof T;
      const error = validateField(field, values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validateField]);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateForm,
    resetForm,
    isValid: Object.keys(errors).length === 0,
  };
}
